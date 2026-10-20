import uuid

from redsky_ocr import errors, repository
from redsky_ocr.sources import Link


def make_document(pool, tenant_id, name="memo.pdf"):
    with pool.connection() as connection:
        document, created = repository.create_document(
            connection,
            tenant_id=tenant_id,
            source_system="storage",
            source_id=f"documents/{uuid.uuid4()}/{name}",
            filename=name,
            links=[Link("twenty", "company", str(uuid.uuid4()))],
            uploaded_by=None,
            no_ai=False,
        )
    assert created
    return document


def enqueue(pool, document, engine="auto", max_attempts=3):
    with pool.connection() as connection:
        return repository.enqueue_extraction(
            connection,
            document_id=str(document["id"]),
            requested_engine=engine,
            requested_by=None,
            max_attempts=max_attempts,
        )


def claim(pool, worker="worker-a"):
    with pool.connection() as connection:
        return repository.claim_next(connection, worker)


def document_status(pool, document):
    with pool.connection() as connection:
        return connection.execute(
            "select status, status_reason from redsky_ocr.document where id = %s", (document["id"],)
        ).fetchone()


def payload(pages=1, needs_review=False):
    return {
        "mimeType": "application/pdf",
        "quality": {
            "pageCount": pages,
            "ocrPageCount": pages,
            "meanOcrConfidence": 91.5,
            "flags": ["no_text"] if needs_review else [],
            "needsReview": needs_review,
        },
        "result": {
            "engine": "tesseract",
            "engine_version": "test",
            "pages": [
                {
                    "page_number": number,
                    "method": "ocr",
                    "text": f"Quarterly revenue page {number}\x00",
                    "markdown": f"Quarterly revenue page {number}",
                    "ocr_confidence": 91.5,
                    "width": 612.0,
                    "height": 792.0,
                }
                for number in range(1, pages + 1)
            ],
            "tables": [{"page_number": 1, "cells": [["a", "b"], ["1", "2"]], "markdown": "|a|b|", "caption": None}],
            "chunks": [{"text": "Quarterly revenue", "headings": ["Summary"], "page_start": 1, "page_end": pages}],
            "markdown": "Quarterly revenue",
            "plaintext": "Quarterly revenue",
            "routing": {"classification": "scanned"},
            "docling_json": {"schema_name": "DoclingDocument"},
            "warnings": [],
        },
    }


def test_enqueue_is_idempotent_while_a_job_is_active(pool, workspace_id):
    document = make_document(pool, workspace_id)

    first, first_created = enqueue(pool, document)
    second, second_created = enqueue(pool, document)

    assert first_created and not second_created
    assert first["id"] == second["id"]
    assert document_status(pool, document)["status"] == "queued"


def test_claim_takes_the_job_and_marks_the_document_processing(pool, workspace_id):
    document = make_document(pool, workspace_id)
    enqueue(pool, document)

    job = claim(pool)

    assert job["status"] == "processing" and job["attempts"] == 1
    assert document_status(pool, document)["status"] == "processing"
    assert claim(pool) is None


def test_concurrent_workers_never_claim_the_same_job(pool, workspace_id):
    enqueue(pool, make_document(pool, workspace_id))
    with pool.connection() as holding:
        # Worker A has claimed but not committed yet.
        first = repository.claim_next(holding, "worker-a")
        assert first is not None
        assert claim(pool, "worker-b") is None


def test_retryable_failure_requeues_with_backoff(pool, workspace_id):
    document = make_document(pool, workspace_id)
    enqueue(pool, document)
    job = claim(pool)

    with pool.connection() as connection:
        outcome = repository.fail_extraction(
            connection, job["id"], errors.SOURCE_UNAVAILABLE, "down", retryable=True
        )
        row = repository.get_extraction(connection, job["id"])
        delay = connection.execute("select extract(epoch from run_after - now()) as delay from redsky_ocr.extraction where id = %s", (job["id"],)).fetchone()["delay"]

    assert outcome == "queued" and row["status"] == "queued"
    assert 20 < delay <= 30
    # Not claimable again until the backoff has passed.
    assert claim(pool) is None


def test_job_fails_after_its_last_attempt(pool, workspace_id):
    document = make_document(pool, workspace_id)
    enqueue(pool, document, max_attempts=2)
    for attempt in range(2):
        job = claim(pool)
        with pool.connection() as connection:
            outcome = repository.fail_extraction(connection, job["id"], errors.SOURCE_UNAVAILABLE, "down", retryable=True)
            connection.execute("update redsky_ocr.extraction set run_after = now() where id = %s", (job["id"],))

    assert outcome == "failed"
    assert document_status(pool, document) == {"status": "failed", "status_reason": errors.SOURCE_UNAVAILABLE}


def test_permanent_failure_is_not_retried(pool, workspace_id):
    document = make_document(pool, workspace_id)
    enqueue(pool, document)
    job = claim(pool)

    with pool.connection() as connection:
        outcome = repository.fail_extraction(connection, job["id"], errors.CORRUPT_FILE, "bad", retryable=False)

    assert outcome == "failed"
    assert document_status(pool, document)["status_reason"] == errors.CORRUPT_FILE


def test_abandoned_jobs_are_recovered(pool, workspace_id):
    document = make_document(pool, workspace_id)
    enqueue(pool, document)
    job = claim(pool)
    with pool.connection() as connection:
        connection.execute(
            "update redsky_ocr.extraction set heartbeat_at = now() - interval '10 minutes' where id = %s",
            (job["id"],),
        )

    with pool.connection() as connection:
        recovered = repository.recover_stale(connection, 120)
        row = repository.get_extraction(connection, job["id"])

    assert recovered == 1
    assert row["status"] == "queued" and row["error_code"] == errors.WORKER_CRASHED


def test_only_the_lock_holder_can_record_an_outcome(pool, workspace_id):
    enqueue(pool, make_document(pool, workspace_id))
    job = claim(pool, "worker-a")

    with pool.connection() as connection:
        assert repository.lock_owned(connection, job["id"], "worker-a")
        assert not repository.lock_owned(connection, job["id"], "worker-b")


def test_completion_persists_pages_tables_chunks_and_artifact(pool, workspace_id):
    document = make_document(pool, workspace_id)
    enqueue(pool, document)
    job = claim(pool)

    with pool.connection() as connection:
        status = repository.complete_extraction(connection, job["id"], payload(pages=2))
        pages = repository.list_pages(connection, job["id"])
        tables = repository.list_tables(connection, job["id"])
        chunks = repository.list_chunks(connection, job["id"])
        stored = repository.get_document(connection, workspace_id, str(document["id"]))
        artifact = connection.execute(
            "select length(docling_json_gzip) as size from redsky_ocr.extraction_artifact where extraction_id = %s",
            (job["id"],),
        ).fetchone()

    assert status == "completed"
    assert [page["page_number"] for page in pages] == [1, 2]
    assert "\x00" not in pages[0]["text"]
    assert tables[0]["cells"] == [["a", "b"], ["1", "2"]]
    assert chunks[0]["headings"] == ["Summary"] and chunks[0]["page_end"] == 2
    assert stored["current_extraction_id"] == job["id"] and stored["mime_type"] == "application/pdf"
    assert artifact["size"] > 0


def test_quality_problems_mark_the_document_for_review(pool, workspace_id):
    document = make_document(pool, workspace_id)
    enqueue(pool, document)
    job = claim(pool)

    with pool.connection() as connection:
        status = repository.complete_extraction(connection, job["id"], payload(needs_review=True))

    assert status == "needs_review"
    assert document_status(pool, document) == {"status": "needs_review", "status_reason": "no_text"}


def test_deleting_a_document_purges_everything_derived_from_it(pool, workspace_id):
    document = make_document(pool, workspace_id)
    enqueue(pool, document)
    job = claim(pool)
    with pool.connection() as connection:
        repository.complete_extraction(connection, job["id"], payload())

    with pool.connection() as connection:
        assert repository.delete_document(connection, workspace_id, str(document["id"]))
        leftovers = connection.execute(
            """
            select (select count(*) from redsky_ocr.extraction)
                 + (select count(*) from redsky_ocr.document_link)
                 + (select count(*) from redsky_ocr.page)
                 + (select count(*) from redsky_ocr.extracted_table)
                 + (select count(*) from redsky_ocr.chunk)
                 + (select count(*) from redsky_ocr.extraction_artifact) as total
            """
        ).fetchone()["total"]

    assert leftovers == 0


def test_search_is_scoped_to_the_workspace_and_current_extraction(pool, workspace_id):
    document = make_document(pool, workspace_id)
    enqueue(pool, document)
    job = claim(pool)
    with pool.connection() as connection:
        repository.complete_extraction(connection, job["id"], payload())

    with pool.connection() as connection:
        own = repository.search_pages(connection, workspace_id, "revenue", 10)
        other = repository.search_pages(connection, str(uuid.uuid4()), "revenue", 10)

    assert [hit["page_number"] for hit in own] == [1]
    assert "<<revenue>>" in own[0]["snippet"]
    assert other == []
