import gzip
import json
import uuid
from typing import Any

from psycopg import Connection
from psycopg.types.json import Jsonb

from redsky_ocr import errors

RETRY_BASE_SECONDS = 30


def new_id() -> str:
    return str(uuid.uuid4())


def find_document_by_attachment(
    connection: Connection, workspace_id: str, attachment_id: str
) -> dict[str, Any] | None:
    return connection.execute(
        "select * from redsky_ocr.document where workspace_id = %s and attachment_id = %s",
        (workspace_id, attachment_id),
    ).fetchone()


def get_document(connection: Connection, workspace_id: str, document_id: str) -> dict[str, Any] | None:
    return connection.execute(
        "select * from redsky_ocr.document where workspace_id = %s and id = %s",
        (workspace_id, document_id),
    ).fetchone()


def create_document(
    connection: Connection,
    *,
    workspace_id: str,
    attachment_id: str,
    file_id: str | None,
    filename: str,
    linked_object: str | None,
    linked_record_id: str | None,
    uploaded_by_user_id: str | None,
    uploaded_by_workspace_member_id: str | None,
    no_ai: bool,
) -> tuple[dict[str, Any], bool]:
    row = connection.execute(
        """
        insert into redsky_ocr.document (
          id, workspace_id, attachment_id, file_id, filename, linked_object,
          linked_record_id, uploaded_by_user_id, uploaded_by_workspace_member_id,
          no_ai, status, status_reason, status_message
        ) values (%s, %s, %s, %s, %s, %s, %s, %s, %s, %s, 'uploaded', %s, %s)
        on conflict (workspace_id, attachment_id) do nothing
        returning *
        """,
        (
            new_id(),
            workspace_id,
            attachment_id,
            file_id,
            filename,
            linked_object,
            linked_record_id,
            uploaded_by_user_id,
            uploaded_by_workspace_member_id,
            no_ai,
            errors.NO_AI_DOCUMENT if no_ai else None,
            "The file is marked _NOAI; its content is never extracted." if no_ai else None,
        ),
    ).fetchone()
    if row is not None:
        return row, True
    existing = find_document_by_attachment(connection, workspace_id, attachment_id)
    assert existing is not None
    return existing, False


def enqueue_extraction(
    connection: Connection,
    *,
    document_id: str,
    requested_engine: str,
    requested_by_workspace_member_id: str | None,
    max_attempts: int,
) -> tuple[dict[str, Any], bool]:
    row = connection.execute(
        """
        insert into redsky_ocr.extraction (
          id, document_id, requested_engine, status, max_attempts,
          requested_by_workspace_member_id
        ) values (%s, %s, %s, 'queued', %s, %s)
        on conflict (document_id) where status in ('queued', 'processing') do nothing
        returning *
        """,
        (new_id(), document_id, requested_engine, max_attempts, requested_by_workspace_member_id),
    ).fetchone()
    created = row is not None
    if row is None:
        row = connection.execute(
            """
            select * from redsky_ocr.extraction
            where document_id = %s and status in ('queued', 'processing')
            """,
            (document_id,),
        ).fetchone()
    else:
        connection.execute(
            """
            update redsky_ocr.document
            set status = 'queued', status_reason = null, status_message = null, updated_at = now()
            where id = %s
            """,
            (document_id,),
        )
    assert row is not None
    return row, created


def claim_next(connection: Connection, worker_id: str) -> dict[str, Any] | None:
    row = connection.execute(
        """
        with next_job as (
          select id from redsky_ocr.extraction
          where status = 'queued' and run_after <= now()
          order by run_after
          for update skip locked
          limit 1
        )
        update redsky_ocr.extraction as extraction
        set status = 'processing', attempts = extraction.attempts + 1,
            locked_by = %s, locked_at = now(), heartbeat_at = now(),
            started_at = now(), updated_at = now()
        from next_job
        where extraction.id = next_job.id
        returning extraction.*
        """,
        (worker_id,),
    ).fetchone()
    if row is None:
        return None
    connection.execute(
        "update redsky_ocr.document set status = 'processing', updated_at = now() where id = %s",
        (row["document_id"],),
    )
    return row


def heartbeat(connection: Connection, extraction_id: str, worker_id: str) -> None:
    connection.execute(
        """
        update redsky_ocr.extraction set heartbeat_at = now()
        where id = %s and locked_by = %s and status = 'processing'
        """,
        (extraction_id, worker_id),
    )


def lock_owned(connection: Connection, extraction_id: str, worker_id: str) -> bool:
    # Taken at the start of the transaction that records the outcome: if the
    # job was handed to another worker meanwhile, this worker's result is
    # dropped rather than written twice.
    row = connection.execute(
        """
        select id from redsky_ocr.extraction
        where id = %s and locked_by = %s and status = 'processing'
        for update
        """,
        (extraction_id, worker_id),
    ).fetchone()
    return row is not None


def recover_stale(connection: Connection, stale_seconds: int) -> int:
    # A worker that died mid-job stops heart-beating; give its job back to
    # the queue, or fail it once it has used its attempts.
    rows = connection.execute(
        """
        select id, attempts, max_attempts from redsky_ocr.extraction
        where status = 'processing' and heartbeat_at < now() - make_interval(secs => %s)
        for update skip locked
        """,
        (stale_seconds,),
    ).fetchall()
    for row in rows:
        fail_extraction(
            connection,
            row["id"],
            errors.WORKER_CRASHED,
            "The worker processing this document stopped responding.",
            retryable=True,
        )
    return len(rows)


def fail_extraction(
    connection: Connection,
    extraction_id: str,
    code: str,
    message: str,
    *,
    retryable: bool,
) -> str:
    extraction = connection.execute(
        "select * from redsky_ocr.extraction where id = %s", (extraction_id,)
    ).fetchone()
    assert extraction is not None
    if retryable and extraction["attempts"] < extraction["max_attempts"]:
        delay = RETRY_BASE_SECONDS * 2 ** max(0, extraction["attempts"] - 1)
        connection.execute(
            """
            update redsky_ocr.extraction
            set status = 'queued', run_after = now() + make_interval(secs => %s),
                locked_by = null, locked_at = null, heartbeat_at = null,
                error_code = %s, error_message = %s, updated_at = now()
            where id = %s
            """,
            (delay, code, message, extraction_id),
        )
        document_status = "queued"
    else:
        connection.execute(
            """
            update redsky_ocr.extraction
            set status = 'failed', locked_by = null, finished_at = now(),
                duration_ms = (extract(epoch from now() - started_at) * 1000)::int,
                error_code = %s, error_message = %s, updated_at = now()
            where id = %s
            """,
            (code, message, extraction_id),
        )
        document_status = "failed"
    connection.execute(
        """
        update redsky_ocr.document
        set status = %s, status_reason = %s, status_message = %s, updated_at = now()
        where id = %s
        """,
        (document_status, code, message, extraction["document_id"]),
    )
    return document_status


def record_file_details(
    connection: Connection,
    document_id: str,
    *,
    filename: str,
    size_bytes: int,
    sha256: str,
    mime_type: str | None,
    linked_object: str | None,
    linked_record_id: str | None,
) -> None:
    connection.execute(
        """
        update redsky_ocr.document
        set filename = %s, size_bytes = %s, sha256 = %s, mime_type = coalesce(%s, mime_type),
            linked_object = %s, linked_record_id = %s, updated_at = now()
        where id = %s
        """,
        (filename, size_bytes, sha256, mime_type, linked_object, linked_record_id, document_id),
    )


def complete_extraction(
    connection: Connection, extraction_id: str, payload: dict[str, Any]
) -> str:
    result = payload["result"]
    quality = payload["quality"]
    status = "needs_review" if quality["needsReview"] else "completed"
    extraction = connection.execute(
        "select document_id from redsky_ocr.extraction where id = %s", (extraction_id,)
    ).fetchone()
    assert extraction is not None

    with connection.cursor() as cursor:
        cursor.executemany(
            """
            insert into redsky_ocr.page (
              extraction_id, page_number, method, text, markdown, ocr_confidence, width, height
            ) values (%s, %s, %s, %s, %s, %s, %s, %s)
            """,
            [
                (
                    extraction_id,
                    page["page_number"],
                    page["method"],
                    _clean(page["text"]),
                    _clean(page["markdown"]),
                    page["ocr_confidence"],
                    page["width"],
                    page["height"],
                )
                for page in result["pages"]
            ],
        )
        cursor.executemany(
            """
            insert into redsky_ocr.extracted_table (
              extraction_id, table_index, page_number, row_count, column_count, cells,
              markdown, caption
            ) values (%s, %s, %s, %s, %s, %s, %s, %s)
            """,
            [
                (
                    extraction_id,
                    index,
                    table["page_number"],
                    len(table["cells"]),
                    max((len(row) for row in table["cells"]), default=0),
                    Jsonb([[_clean(cell) for cell in row] for row in table["cells"]]),
                    _clean(table["markdown"]),
                    _clean(table["caption"]) if table["caption"] else None,
                )
                for index, table in enumerate(result["tables"])
            ],
        )
        cursor.executemany(
            """
            insert into redsky_ocr.chunk (
              extraction_id, chunk_index, text, headings, page_start, page_end
            ) values (%s, %s, %s, %s, %s, %s)
            """,
            [
                (
                    extraction_id,
                    index,
                    _clean(chunk["text"]),
                    [_clean(heading) for heading in chunk["headings"]],
                    chunk["page_start"],
                    chunk["page_end"],
                )
                for index, chunk in enumerate(result["chunks"])
            ],
        )
    if result.get("docling_json") is not None:
        connection.execute(
            """
            insert into redsky_ocr.extraction_artifact (extraction_id, docling_json_gzip)
            values (%s, %s)
            """,
            (extraction_id, gzip.compress(json.dumps(result["docling_json"]).encode())),
        )

    routing = {**result["routing"], "warnings": result["warnings"][:20]}
    connection.execute(
        """
        update redsky_ocr.extraction
        set status = %s, engine = %s, engine_version = %s, routing = %s, quality = %s,
            page_count = %s, ocr_page_count = %s, mean_ocr_confidence = %s,
            markdown = %s, plaintext = %s, error_code = null, error_message = null,
            locked_by = null, finished_at = now(),
            duration_ms = (extract(epoch from now() - started_at) * 1000)::int,
            updated_at = now()
        where id = %s
        """,
        (
            status,
            result["engine"],
            result["engine_version"],
            Jsonb(routing),
            Jsonb(quality),
            quality["pageCount"],
            quality["ocrPageCount"],
            quality["meanOcrConfidence"],
            _clean(result["markdown"]),
            _clean(result["plaintext"]),
            extraction_id,
        ),
    )
    connection.execute(
        """
        update redsky_ocr.document
        set status = %s, status_reason = %s, status_message = %s, mime_type = %s,
            current_extraction_id = %s, updated_at = now()
        where id = %s
        """,
        (
            status,
            ",".join(quality["flags"]) or None,
            "Check the extracted text: " + ", ".join(quality["flags"]).replace("_", " ")
            if quality["flags"]
            else None,
            payload["mimeType"],
            extraction_id,
            extraction["document_id"],
        ),
    )
    return status


def get_extraction(connection: Connection, extraction_id: str) -> dict[str, Any] | None:
    return connection.execute(
        "select * from redsky_ocr.extraction where id = %s", (extraction_id,)
    ).fetchone()


def latest_extraction(connection: Connection, document_id: str) -> dict[str, Any] | None:
    return connection.execute(
        """
        select * from redsky_ocr.extraction where document_id = %s
        order by created_at desc limit 1
        """,
        (document_id,),
    ).fetchone()


def list_pages(connection: Connection, extraction_id: str) -> list[dict[str, Any]]:
    return connection.execute(
        """
        select page_number, method, text, markdown, ocr_confidence, width, height
        from redsky_ocr.page where extraction_id = %s order by page_number
        """,
        (extraction_id,),
    ).fetchall()


def list_tables(connection: Connection, extraction_id: str) -> list[dict[str, Any]]:
    return connection.execute(
        """
        select table_index, page_number, row_count, column_count, cells, markdown, caption
        from redsky_ocr.extracted_table where extraction_id = %s order by table_index
        """,
        (extraction_id,),
    ).fetchall()


def list_chunks(connection: Connection, extraction_id: str) -> list[dict[str, Any]]:
    return connection.execute(
        """
        select chunk_index, text, headings, page_start, page_end
        from redsky_ocr.chunk where extraction_id = %s order by chunk_index
        """,
        (extraction_id,),
    ).fetchall()


def list_documents(
    connection: Connection,
    workspace_id: str,
    *,
    attachment_id: str | None,
    linked_object: str | None,
    linked_record_id: str | None,
    status: str | None,
    limit: int,
) -> list[dict[str, Any]]:
    conditions = ["workspace_id = %s"]
    parameters: list[Any] = [workspace_id]
    for column, value in (
        ("attachment_id", attachment_id),
        ("linked_object", linked_object),
        ("linked_record_id", linked_record_id),
        ("status", status),
    ):
        if value is not None:
            conditions.append(f"{column} = %s")
            parameters.append(value)
    parameters.append(limit)
    return connection.execute(
        f"""
        select * from redsky_ocr.document
        where {" and ".join(conditions)}
        order by created_at desc
        limit %s
        """,
        parameters,
    ).fetchall()


def search_pages(
    connection: Connection, workspace_id: str, query: str, limit: int
) -> list[dict[str, Any]]:
    return connection.execute(
        """
        with matches as (
          select document.id as document_id, document.attachment_id, document.filename,
                 page.page_number, page.text,
                 ts_rank(page.search_vector, query) as rank, query
          from redsky_ocr.page as page
          join redsky_ocr.document as document
            on document.current_extraction_id = page.extraction_id
          cross join websearch_to_tsquery('english', %s) as query
          where document.workspace_id = %s and page.search_vector @@ query
          order by rank desc
          limit %s
        )
        select document_id, attachment_id, filename, page_number, rank,
               ts_headline('english', text, query,
                 'MaxFragments=2, MaxWords=30, MinWords=10, StartSel=<<, StopSel=>>') as snippet
        from matches
        order by rank desc
        """,
        (query, workspace_id, limit),
    ).fetchall()


def delete_document(connection: Connection, workspace_id: str, attachment_id: str) -> bool:
    deleted = connection.execute(
        """
        delete from redsky_ocr.document where workspace_id = %s and attachment_id = %s
        returning id
        """,
        (workspace_id, attachment_id),
    ).fetchone()
    return deleted is not None


def get_sync_cursor(connection: Connection, workspace_id: str) -> str | None:
    row = connection.execute(
        "select attachments_created_since from redsky_ocr.sync_state where workspace_id = %s",
        (workspace_id,),
    ).fetchone()
    return row["attachments_created_since"].isoformat() if row else None


def set_sync_cursor(connection: Connection, workspace_id: str, created_since: str) -> None:
    connection.execute(
        """
        insert into redsky_ocr.sync_state (workspace_id, attachments_created_since)
        values (%s, %s)
        on conflict (workspace_id) do update
        set attachments_created_since = excluded.attachments_created_since, updated_at = now()
        """,
        (workspace_id, created_since),
    )


def _clean(value: str) -> str:
    # Postgres text cannot hold NUL, which broken PDFs and OCR can produce.
    return value.replace("\x00", "")
