import json
import logging
import re
import time
import uuid
from contextlib import asynccontextmanager
from typing import Annotated, Any, Literal

from fastapi import Depends, FastAPI, HTTPException, Query, Request, UploadFile, status
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse, PlainTextResponse, Response
from psycopg_pool import ConnectionPool
from pydantic import BaseModel
from starlette.concurrency import run_in_threadpool

from redsky_ocr import errors, repository
from redsky_ocr.api.security import Authenticator, verify_webhook_signature
from redsky_ocr.api.serializers import (
    serialize_chunk,
    serialize_document,
    serialize_page,
    serialize_table,
)
from redsky_ocr.config import EngineName, Settings
from redsky_ocr.engines.docling_engine import DoclingEngine
from redsky_ocr.engines.router import build_engines
from redsky_ocr.engines.tesseract import tesseract_version
from redsky_ocr.errors import ProcessingError
from redsky_ocr.runtime import engine_options, is_no_ai, limits
from redsky_ocr.twenty import (
    Principal,
    TwentyClient,
    TwentyError,
    TwentyForbidden,
    TwentyNotFound,
    TwentyUnauthenticated,
    TwentyUnavailable,
    parse_attachment,
)
from redsky_ocr.validation import sniff

logger = logging.getLogger(__name__)

OBJECT_NAME = re.compile(r"^[a-z][A-Za-z0-9]{0,62}$")
MAX_LIST_LIMIT = 100
# Multipart framing around the file itself.
UPLOAD_OVERHEAD_BYTES = 1024 * 1024
# Twenty's attachment events are a few kilobytes.
MAX_WEBHOOK_BYTES = 1024 * 1024
FILENAME_UNSAFE = re.compile(r"[\x00-\x1f/\\]")


class RegisterAttachmentBody(BaseModel):
    attachmentId: uuid.UUID
    engine: EngineName = "auto"


class ReprocessBody(BaseModel):
    engine: EngineName = "auto"


def create_app(
    settings: Settings,
    pool: ConnectionPool | None = None,
    twenty: TwentyClient | None = None,
) -> FastAPI:
    owns_pool = pool is None
    owns_twenty = twenty is None

    @asynccontextmanager
    async def lifespan(app: FastAPI):
        app.state.pool = pool or ConnectionPool(
            settings.database_url.get_secret_value(),
            min_size=1,
            max_size=10,
            kwargs={"autocommit": False, "row_factory": _dict_row()},
            open=True,
        )
        app.state.twenty = twenty or TwentyClient(
            settings.twenty_url,
            settings.twenty_timeout_seconds,
            settings.file_download_hosts,
            public_url=settings.twenty_public_url,
        )
        app.state.auth = Authenticator(app.state.twenty, settings.auth_cache_seconds)
        yield
        if owns_twenty:
            app.state.twenty.close()
        if owns_pool:
            app.state.pool.close()

    app = FastAPI(
        title="RedSky OCR",
        version="0.1.0",
        lifespan=lifespan,
        # No interactive docs on a service that handles confidential files.
        docs_url=None,
        redoc_url=None,
        openapi_url="/api/v1/openapi.json",
    )
    if settings.cors_allowed_origins:
        app.add_middleware(
            CORSMiddleware,
            allow_origins=settings.cors_allowed_origins,
            allow_methods=["GET", "POST"],
            allow_headers=["Authorization", "Content-Type"],
            allow_credentials=False,
        )

    @app.middleware("http")
    async def harden_and_log(request: Request, call_next):
        started = time.monotonic()
        # Bodies are read whole, and the webhook's before its signature is
        # checked, so their size is bounded before anything is read.
        body_limit = {
            "/api/v1/documents": settings.max_file_bytes + UPLOAD_OVERHEAD_BYTES,
            "/api/v1/webhooks/twenty": MAX_WEBHOOK_BYTES,
        }.get(request.url.path)
        if request.method == "POST" and body_limit is not None:
            length = request.headers.get("content-length")
            if length is None:
                return JSONResponse(
                    {"detail": "A Content-Length header is required."},
                    status_code=status.HTTP_411_LENGTH_REQUIRED,
                )
            if not length.isdigit() or int(length) > body_limit:
                return JSONResponse(
                    {"detail": "The request is larger than the size limit.", "code": errors.FILE_TOO_LARGE},
                    status_code=status.HTTP_413_CONTENT_TOO_LARGE,
                )
        response = await call_next(request)
        response.headers["Cache-Control"] = "no-store"
        response.headers["X-Content-Type-Options"] = "nosniff"
        response.headers["Referrer-Policy"] = "no-referrer"
        route = request.scope.get("route")
        # Route templates only: paths and query strings can carry search terms.
        logger.info(
            "request",
            extra={
                "method": request.method,
                "route": getattr(route, "path", "unmatched"),
                "status": response.status_code,
                "durationMs": int((time.monotonic() - started) * 1000),
            },
        )
        return response

    def principal_dependency(request: Request) -> Principal:
        return request.app.state.auth.principal(request)

    CurrentPrincipal = Annotated[Principal, Depends(principal_dependency)]

    def load_document(request: Request, principal: Principal, document_id: uuid.UUID) -> dict[str, Any]:
        with request.app.state.pool.connection() as connection:
            document = repository.get_document(connection, principal.workspace_id, str(document_id))
        # Missing and forbidden look the same: the existence of a document the
        # caller cannot see is not disclosed.
        if document is None or not request.app.state.auth.can_read_attachment(
            principal, str(document["attachment_id"])
        ):
            raise HTTPException(status.HTTP_404_NOT_FOUND, "Document not found.")
        return document

    def current_extraction(request: Request, document: dict[str, Any]) -> dict[str, Any]:
        if document["current_extraction_id"] is None:
            raise HTTPException(
                status.HTTP_409_CONFLICT,
                {
                    "code": "CONTENT_NOT_READY",
                    "status": document["status"],
                    "message": "No extracted content is available yet.",
                },
            )
        with request.app.state.pool.connection() as connection:
            extraction = repository.get_extraction(connection, str(document["current_extraction_id"]))
        assert extraction is not None
        return extraction

    def document_response(request: Request, document: dict[str, Any]) -> dict[str, Any]:
        with request.app.state.pool.connection() as connection:
            latest = repository.latest_extraction(connection, str(document["id"]))
            current = (
                repository.get_extraction(connection, str(document["current_extraction_id"]))
                if document["current_extraction_id"]
                else None
            )
        return serialize_document(document, latest, current)

    def ensure_engine_enabled(engine: str) -> None:
        # Format-specific limits (for example Docling without its layout
        # models) are reported by the worker; switched-off engines fail here.
        if engine == "auto":
            return
        reason = build_engines(engine_options(settings))[engine].availability()
        if reason is not None:
            raise HTTPException(
                status.HTTP_422_UNPROCESSABLE_CONTENT,
                {"code": errors.ENGINE_UNAVAILABLE, "message": reason},
            )

    def register(
        request: Request,
        principal: Principal,
        attachment_record: Any,
        engine: str,
        always_accepted: bool = False,
    ) -> JSONResponse:
        with request.app.state.pool.connection() as connection:
            no_ai = is_no_ai(attachment_record.name)
            document, created = repository.create_document(
                connection,
                workspace_id=principal.workspace_id,
                attachment_id=attachment_record.id,
                file_id=attachment_record.file_id,
                filename=attachment_record.name,
                linked_object=attachment_record.linked_object,
                linked_record_id=attachment_record.linked_record_id,
                uploaded_by_user_id=principal.user_id,
                uploaded_by_workspace_member_id=principal.workspace_member_id,
                no_ai=no_ai,
            )
            if not no_ai and (created or document["current_extraction_id"] is None):
                repository.enqueue_extraction(
                    connection,
                    document_id=str(document["id"]),
                    requested_engine=engine,
                    requested_by_workspace_member_id=principal.workspace_member_id,
                    max_attempts=settings.job_max_attempts,
                )
            document = repository.get_document(connection, principal.workspace_id, str(document["id"]))
        assert document is not None
        return JSONResponse(
            document_response(request, document),
            status_code=status.HTTP_202_ACCEPTED if created or always_accepted else status.HTTP_200_OK,
        )

    @app.get("/health", include_in_schema=False)
    def health() -> dict[str, str]:
        return {"status": "ok"}

    @app.get("/ready", include_in_schema=False)
    def ready(request: Request) -> JSONResponse:
        checks: dict[str, Any] = {}
        try:
            with request.app.state.pool.connection() as connection:
                connection.execute("select 1 from redsky_ocr.schema_migration limit 1")
            checks["database"] = "ok"
        except Exception:
            checks["database"] = "unavailable"
        checks["tesseract"] = tesseract_version() or "missing"
        is_ready = checks["database"] == "ok" and checks["tesseract"] != "missing"
        return JSONResponse(
            {"status": "ready" if is_ready else "not_ready", "checks": checks},
            status_code=status.HTTP_200_OK if is_ready else status.HTTP_503_SERVICE_UNAVAILABLE,
        )

    @app.get("/api/v1/engines")
    def list_engines(principal: CurrentPrincipal) -> dict[str, Any]:
        engines = build_engines(engine_options(settings))
        described = []
        for name, engine in engines.items():
            reason = engine.availability()
            entry: dict[str, Any] = {
                "name": name,
                "available": reason is None,
                "reason": reason,
                "version": engine.version() if reason is None else None,
                "formats": [
                    kind for kind in ("pdf", "image", "docx", "pptx", "xlsx") if engine.supports(kind)
                ],
            }
            if isinstance(engine, DoclingEngine):
                entry["layoutModels"] = engine.layout_availability() is None
                entry["layoutReason"] = engine.layout_availability()
            described.append(entry)
        return {"defaultEngine": settings.default_engine, "engines": described}

    @app.post("/api/v1/documents", status_code=status.HTTP_202_ACCEPTED)
    async def create_document(request: Request, principal: CurrentPrincipal) -> Response:
        content_type = request.headers.get("content-type", "")
        if content_type.startswith("application/json"):
            try:
                body = RegisterAttachmentBody.model_validate(await request.json())
            except (ValueError, json.JSONDecodeError) as error:
                raise HTTPException(
                    status.HTTP_422_UNPROCESSABLE_CONTENT, "Send {attachmentId, engine}."
                ) from error
            return await run_in_threadpool(
                register_existing_attachment, request, principal, str(body.attachmentId), body.engine
            )
        if content_type.startswith("multipart/form-data"):
            form = await request.form(max_files=1, max_fields=10)
            return await upload_and_register(request, principal, form)
        raise HTTPException(
            status.HTTP_415_UNSUPPORTED_MEDIA_TYPE,
            "Send JSON {attachmentId} or a multipart upload with a file.",
        )

    def register_existing_attachment(
        request: Request, principal: Principal, attachment_id: str, engine: str
    ) -> JSONResponse:
        ensure_engine_enabled(engine)
        try:
            attachment_record = request.app.state.twenty.get_attachment(principal.token, attachment_id)
        except (TwentyForbidden, TwentyNotFound) as error:
            raise HTTPException(status.HTTP_404_NOT_FOUND, "Attachment not found.") from error
        except TwentyUnauthenticated as error:
            raise HTTPException(status.HTTP_401_UNAUTHORIZED, "The access token was rejected.") from error
        except TwentyError as error:
            raise HTTPException(
                status.HTTP_503_SERVICE_UNAVAILABLE, "RedSky could not read the attachment."
            ) from error
        return register(request, principal, attachment_record, engine)

    async def upload_and_register(request: Request, principal: Principal, form: Any) -> JSONResponse:
        upload = form.get("file")
        linked_object = form.get("linkedObject")
        linked_record_id = form.get("linkedRecordId")
        engine = form.get("engine") or "auto"
        if not isinstance(upload, UploadFile) and not hasattr(upload, "read"):
            raise HTTPException(status.HTTP_422_UNPROCESSABLE_CONTENT, "A file field is required.")
        if not isinstance(linked_object, str) or not OBJECT_NAME.match(linked_object):
            raise HTTPException(
                status.HTTP_422_UNPROCESSABLE_CONTENT,
                "linkedObject must be a record type such as company, person or opportunity.",
            )
        try:
            linked_record_id = str(uuid.UUID(str(linked_record_id)))
        except ValueError as error:
            raise HTTPException(status.HTTP_422_UNPROCESSABLE_CONTENT, "linkedRecordId must be a UUID.") from error
        if engine not in ("auto", "docling", "tesseract", "granite_docling"):
            raise HTTPException(status.HTTP_422_UNPROCESSABLE_CONTENT, "Unknown engine.")
        ensure_engine_enabled(engine)

        data = await upload.read(settings.max_file_bytes + 1)
        filename = FILENAME_UNSAFE.sub("_", upload.filename or "document")[:200] or "document"
        try:
            # Cheap checks before anything is stored; the worker re-checks
            # everything inside its sandbox.
            sniff(data, limits(settings))
        except ProcessingError as error:
            code = {
                errors.FILE_TOO_LARGE: status.HTTP_413_CONTENT_TOO_LARGE,
                errors.UNSUPPORTED_TYPE: status.HTTP_415_UNSUPPORTED_MEDIA_TYPE,
            }.get(error.code, status.HTTP_422_UNPROCESSABLE_CONTENT)
            raise HTTPException(code, {"code": error.code, "message": error.message}) from error

        def store() -> JSONResponse:
            try:
                attachment_id = request.app.state.twenty.create_attachment(
                    principal.token,
                    filename=filename,
                    data=data,
                    linked_object=linked_object,
                    linked_record_id=linked_record_id,
                )
                attachment_record = request.app.state.twenty.get_attachment(
                    principal.token, attachment_id
                )
            except TwentyUnauthenticated as error:
                raise HTTPException(status.HTTP_401_UNAUTHORIZED, "The access token was rejected.") from error
            except (TwentyForbidden, TwentyNotFound) as error:
                raise HTTPException(
                    status.HTTP_403_FORBIDDEN,
                    "RedSky did not allow attaching a file to that record.",
                ) from error
            except TwentyUnavailable as error:
                raise HTTPException(
                    status.HTTP_503_SERVICE_UNAVAILABLE, "RedSky could not store the file."
                ) from error
            except TwentyError as error:
                raise HTTPException(
                    status.HTTP_502_BAD_GATEWAY, "RedSky could not store the file."
                ) from error
            # Twenty's attachment.created webhook may register the document
            # before this line does; the upload was accepted either way.
            return register(request, principal, attachment_record, engine, always_accepted=True)

        return await run_in_threadpool(store)

    @app.get("/api/v1/documents")
    def list_documents(
        request: Request,
        principal: CurrentPrincipal,
        attachmentId: uuid.UUID | None = None,
        linkedObject: str | None = None,
        linkedRecordId: uuid.UUID | None = None,
        status_filter: Annotated[
            Literal["uploaded", "queued", "processing", "completed", "failed", "needs_review"] | None,
            Query(alias="status"),
        ] = None,
        limit: Annotated[int, Query(ge=1, le=MAX_LIST_LIMIT)] = 25,
    ) -> dict[str, Any]:
        with request.app.state.pool.connection() as connection:
            rows = repository.list_documents(
                connection,
                principal.workspace_id,
                attachment_id=str(attachmentId) if attachmentId else None,
                linked_object=linkedObject,
                linked_record_id=str(linkedRecordId) if linkedRecordId else None,
                status=status_filter,
                limit=limit,
            )
        visible = [
            row
            for row in rows
            if request.app.state.auth.can_read_attachment(principal, str(row["attachment_id"]))
        ]
        return {"documents": [document_response(request, row) for row in visible]}

    @app.get("/api/v1/documents/{document_id}")
    def get_document(request: Request, principal: CurrentPrincipal, document_id: uuid.UUID) -> dict[str, Any]:
        return document_response(request, load_document(request, principal, document_id))

    @app.get("/api/v1/documents/{document_id}/content")
    def get_content(
        request: Request,
        principal: CurrentPrincipal,
        document_id: uuid.UUID,
        format: Literal["json", "markdown", "text"] = "json",
        download: bool = False,
    ) -> Response:
        document = load_document(request, principal, document_id)
        extraction = current_extraction(request, document)
        stem = re.sub(r"[^A-Za-z0-9._-]+", "_", document["filename"].rsplit(".", 1)[0])[:100] or "document"
        if format in ("markdown", "text"):
            body = extraction["markdown"] if format == "markdown" else extraction["plaintext"]
            media_type = "text/markdown" if format == "markdown" else "text/plain"
            headers = {}
            if download:
                extension = "md" if format == "markdown" else "txt"
                headers["Content-Disposition"] = f'attachment; filename="{stem}.{extension}"'
            return PlainTextResponse(body or "", media_type=f"{media_type}; charset=utf-8", headers=headers)
        with request.app.state.pool.connection() as connection:
            pages = repository.list_pages(connection, str(extraction["id"]))
        return JSONResponse(
            {
                "documentId": str(document["id"]),
                "extractionId": str(extraction["id"]),
                "engine": extraction["engine"],
                "engineVersion": extraction["engine_version"],
                "pageCount": extraction["page_count"],
                "markdown": extraction["markdown"],
                "text": extraction["plaintext"],
                "pages": [serialize_page(page) for page in pages],
            }
        )

    @app.get("/api/v1/documents/{document_id}/tables")
    def get_tables(request: Request, principal: CurrentPrincipal, document_id: uuid.UUID) -> dict[str, Any]:
        document = load_document(request, principal, document_id)
        extraction = current_extraction(request, document)
        with request.app.state.pool.connection() as connection:
            tables = repository.list_tables(connection, str(extraction["id"]))
        return {
            "documentId": str(document["id"]),
            "extractionId": str(extraction["id"]),
            "tables": [serialize_table(table) for table in tables],
        }

    @app.get("/api/v1/documents/{document_id}/chunks")
    def get_chunks(request: Request, principal: CurrentPrincipal, document_id: uuid.UUID) -> dict[str, Any]:
        document = load_document(request, principal, document_id)
        extraction = current_extraction(request, document)
        with request.app.state.pool.connection() as connection:
            chunks = repository.list_chunks(connection, str(extraction["id"]))
        return {
            "documentId": str(document["id"]),
            "extractionId": str(extraction["id"]),
            "noAi": document["no_ai"],
            "chunks": [serialize_chunk(chunk) for chunk in chunks],
        }

    @app.post("/api/v1/documents/{document_id}/reprocess", status_code=status.HTTP_202_ACCEPTED)
    def reprocess(
        request: Request,
        principal: CurrentPrincipal,
        document_id: uuid.UUID,
        body: ReprocessBody | None = None,
    ) -> JSONResponse:
        document = load_document(request, principal, document_id)
        if document["no_ai"]:
            raise HTTPException(
                status.HTTP_409_CONFLICT,
                {"code": errors.NO_AI_DOCUMENT, "message": "The file is marked _NOAI; it is never extracted."},
            )
        engine = (body or ReprocessBody()).engine
        ensure_engine_enabled(engine)
        with request.app.state.pool.connection() as connection:
            extraction, created = repository.enqueue_extraction(
                connection,
                document_id=str(document["id"]),
                requested_engine=engine,
                requested_by_workspace_member_id=principal.workspace_member_id,
                max_attempts=settings.job_max_attempts,
            )
            if not created and extraction["requested_engine"] != engine:
                raise HTTPException(
                    status.HTTP_409_CONFLICT,
                    {
                        "code": "EXTRACTION_IN_PROGRESS",
                        "message": (
                            f"An extraction with engine '{extraction['requested_engine']}' is "
                            "already queued or running. Try again when it finishes."
                        ),
                    },
                )
            document = repository.get_document(connection, principal.workspace_id, str(document["id"]))
        assert document is not None
        return JSONResponse(
            document_response(request, document),
            status_code=status.HTTP_202_ACCEPTED if created else status.HTTP_200_OK,
        )

    @app.get("/api/v1/search")
    def search(
        request: Request,
        principal: CurrentPrincipal,
        q: Annotated[str, Query(min_length=2, max_length=500)],
        limit: Annotated[int, Query(ge=1, le=50)] = 20,
    ) -> dict[str, Any]:
        with request.app.state.pool.connection() as connection:
            # Over-fetch: hits the caller may not see are dropped below.
            rows = repository.search_pages(connection, principal.workspace_id, q, limit * 3)
        results = []
        for row in rows:
            if not request.app.state.auth.can_read_attachment(principal, str(row["attachment_id"])):
                continue
            results.append(
                {
                    "documentId": str(row["document_id"]),
                    "attachmentId": str(row["attachment_id"]),
                    "filename": row["filename"],
                    "pageNumber": row["page_number"],
                    "rank": round(float(row["rank"]), 4),
                    "snippet": row["snippet"],
                }
            )
            if len(results) >= limit:
                break
        return {"query": q, "results": results}

    @app.post("/api/v1/webhooks/twenty", include_in_schema=False)
    async def twenty_webhook(request: Request) -> JSONResponse:
        if settings.twenty_webhook_secret is None:
            raise HTTPException(status.HTTP_404_NOT_FOUND, "Not found.")
        body = await request.body()
        verify_webhook_signature(
            settings.twenty_webhook_secret.get_secret_value(),
            body,
            request.headers.get("x-twenty-webhook-signature"),
            request.headers.get("x-twenty-webhook-timestamp"),
        )
        try:
            event = json.loads(body)
        except json.JSONDecodeError as error:
            raise HTTPException(status.HTTP_400_BAD_REQUEST, "Invalid JSON.") from error
        outcome = await run_in_threadpool(handle_webhook_event, request, event)
        return JSONResponse({"outcome": outcome}, status_code=status.HTTP_202_ACCEPTED)

    def handle_webhook_event(request: Request, event: dict[str, Any]) -> str:
        event_name = event.get("eventName")
        record = event.get("record") or {}
        workspace_id = event.get("workspaceId")
        if not workspace_id or not record.get("id") or not str(event_name).startswith("attachment."):
            return "ignored"
        attachment_id = str(record["id"])
        with request.app.state.pool.connection() as connection:
            if event_name in ("attachment.deleted", "attachment.destroyed"):
                # Extracted text goes with the file it came from.
                return "purged" if repository.delete_document(connection, workspace_id, attachment_id) else "ignored"
            if event_name not in ("attachment.created", "attachment.restored"):
                return "ignored"
            if not settings.auto_process_attachments:
                return "ignored"
            attachment_record = parse_attachment(record)
            no_ai = is_no_ai(attachment_record.name)
            document, created = repository.create_document(
                connection,
                workspace_id=workspace_id,
                attachment_id=attachment_id,
                file_id=attachment_record.file_id,
                filename=attachment_record.name,
                linked_object=attachment_record.linked_object,
                linked_record_id=attachment_record.linked_record_id,
                uploaded_by_user_id=event.get("userId"),
                uploaded_by_workspace_member_id=event.get("workspaceMemberId"),
                no_ai=no_ai,
            )
            if not created:
                return "duplicate"
            if no_ai:
                return "recorded_no_ai"
            repository.enqueue_extraction(
                connection,
                document_id=str(document["id"]),
                requested_engine=settings.default_engine,
                requested_by_workspace_member_id=event.get("workspaceMemberId"),
                max_attempts=settings.job_max_attempts,
            )
        return "queued"

    return app


def _dict_row():
    from psycopg.rows import dict_row

    return dict_row
