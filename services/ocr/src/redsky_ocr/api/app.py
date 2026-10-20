import dataclasses
import json
import logging
import re
import time
import uuid
from contextlib import asynccontextmanager
from typing import Annotated, Any, Literal

from fastapi import Depends, FastAPI, HTTPException, Query, Request, Response, status
from fastapi.responses import JSONResponse, PlainTextResponse
from psycopg_pool import ConnectionPool
from pydantic import BaseModel, Field
from starlette.concurrency import run_in_threadpool

from redsky_ocr import errors, repository
from redsky_ocr.api.security import GATEWAY, Authenticator, Caller, verify_webhook_signature
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
from redsky_ocr.runtime import engine_options, is_no_ai
from redsky_ocr.sources import STORAGE, TWENTY, Link, StorageSource, build_sources, twenty_links
from redsky_ocr.twenty import (
    TwentyClient,
    TwentyError,
    TwentyForbidden,
    TwentyNotFound,
    TwentyUnauthenticated,
    parse_attachment,
)
from redsky_ocr.worker import register_twenty_attachment

logger = logging.getLogger(__name__)

MAX_LIST_LIMIT = 100
# Registration bodies are small JSON documents.
MAX_REGISTER_BYTES = 64 * 1024
# Twenty's attachment events are a few kilobytes.
MAX_WEBHOOK_BYTES = 1024 * 1024
FILENAME_UNSAFE = re.compile(r"[\x00-\x1f/\\]")


class SourceReference(BaseModel):
    system: Literal["storage", "twenty"]
    id: str = Field(min_length=1, max_length=1024)


class LinkReference(BaseModel):
    system: str = Field(pattern=r"^[a-z][a-z0-9_-]{0,31}$")
    object: str = Field(pattern=r"^[a-z][A-Za-z0-9]{0,62}$")
    id: str = Field(min_length=1, max_length=200)


class RegisterBody(BaseModel):
    source: SourceReference
    filename: str | None = Field(default=None, max_length=255)
    links: list[LinkReference] = Field(default_factory=list, max_length=20)
    engine: EngineName = "auto"


class ReprocessBody(BaseModel):
    engine: EngineName = "auto"


def create_app(
    settings: Settings,
    pool: ConnectionPool | None = None,
    twenty: TwentyClient | None = None,
    storage: StorageSource | None = None,
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
        app.state.twenty = twenty
        if app.state.twenty is None and settings.twenty_url:
            app.state.twenty = TwentyClient(
                settings.twenty_url,
                settings.twenty_timeout_seconds,
                settings.file_download_hosts,
                public_url=settings.twenty_public_url,
            )
        app.state.storage = storage or build_sources(settings, None).get(STORAGE)
        app.state.auth = Authenticator(settings, app.state.twenty)
        yield
        if owns_twenty and app.state.twenty is not None:
            app.state.twenty.close()
        if owns_pool:
            app.state.pool.close()

    app = FastAPI(
        title="RedSky OCR",
        version="0.2.0",
        lifespan=lifespan,
        # No interactive docs on a service that handles confidential files.
        docs_url=None,
        redoc_url=None,
        openapi_url="/api/v1/openapi.json",
    )

    @app.middleware("http")
    async def harden_and_log(request: Request, call_next):
        started = time.monotonic()
        # Bodies are read whole, and the webhook's before its signature is
        # checked, so their size is bounded before anything is read.
        body_limit = {
            "/api/v1/documents": MAX_REGISTER_BYTES,
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
                    {"detail": "The request is larger than the size limit."},
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

    def caller_dependency(request: Request) -> Caller:
        return request.app.state.auth.caller(request)

    CurrentCaller = Annotated[Caller, Depends(caller_dependency)]

    def require_gateway(caller: Caller) -> None:
        if caller.kind != GATEWAY:
            raise HTTPException(status.HTTP_403_FORBIDDEN, "Only the RedSky API may do this.")

    def load_document(request: Request, caller: Caller, document_id: uuid.UUID) -> dict[str, Any]:
        with request.app.state.pool.connection() as connection:
            document = repository.get_document(connection, caller.tenant_id, str(document_id))
        # Missing and forbidden look the same: the existence of a document the
        # caller cannot see is not disclosed.
        if document is None or not request.app.state.auth.can_read(caller, document):
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

    def document_responses(request: Request, documents: list[dict[str, Any]]) -> list[dict[str, Any]]:
        if not documents:
            return []
        with request.app.state.pool.connection() as connection:
            links = repository.links_for(connection, [str(document["id"]) for document in documents])
            responses = []
            for document in documents:
                latest = repository.latest_extraction(connection, str(document["id"]))
                current = (
                    repository.get_extraction(connection, str(document["current_extraction_id"]))
                    if document["current_extraction_id"]
                    else None
                )
                responses.append(serialize_document(document, links[str(document["id"])], latest, current))
        return responses

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
        caller: Caller,
        *,
        source_system: str,
        source_id: str,
        filename: str,
        links: list[Link],
        engine: str,
        source_metadata: dict[str, Any] | None = None,
    ) -> JSONResponse:
        no_ai = is_no_ai(filename)
        with request.app.state.pool.connection() as connection:
            document, created = repository.create_document(
                connection,
                tenant_id=caller.tenant_id,
                source_system=source_system,
                source_id=source_id,
                filename=filename,
                links=links,
                uploaded_by=caller.user_id,
                no_ai=no_ai,
                source_metadata=source_metadata,
            )
            if not no_ai and (created or document["current_extraction_id"] is None):
                repository.enqueue_extraction(
                    connection,
                    document_id=str(document["id"]),
                    requested_engine=engine,
                    requested_by=caller.user_id,
                    max_attempts=settings.job_max_attempts,
                )
            document = repository.get_document(connection, caller.tenant_id, str(document["id"]))
        assert document is not None
        return JSONResponse(
            document_responses(request, [document])[0],
            status_code=status.HTTP_202_ACCEPTED if created else status.HTTP_200_OK,
        )

    def register_storage(request: Request, caller: Caller, body: RegisterBody) -> JSONResponse:
        require_gateway(caller)
        storage = request.app.state.storage
        if storage is None:
            raise HTTPException(
                status.HTTP_422_UNPROCESSABLE_CONTENT,
                {"code": errors.SOURCE_NOT_CONFIGURED, "message": "No documents bucket is configured."},
            )
        if not body.filename:
            raise HTTPException(status.HTTP_422_UNPROCESSABLE_CONTENT, "filename is required for storage sources.")
        try:
            if not storage.exists(body.source.id):
                raise HTTPException(status.HTTP_404_NOT_FOUND, "No such object in the documents bucket.")
        except ProcessingError as error:
            code = status.HTTP_503_SERVICE_UNAVAILABLE if error.retryable else status.HTTP_422_UNPROCESSABLE_CONTENT
            raise HTTPException(code, {"code": error.code, "message": error.message}) from error
        filename = FILENAME_UNSAFE.sub("_", body.filename)[:255] or "document"
        links = [Link(link.system, link.object, link.id) for link in body.links]
        return register(
            request,
            caller,
            source_system=STORAGE,
            source_id=body.source.id,
            filename=filename,
            links=links,
            engine=body.engine,
        )

    def register_twenty(request: Request, caller: Caller, body: RegisterBody) -> JSONResponse:
        twenty = request.app.state.twenty
        if twenty is None or settings.twenty_api_key is None:
            raise HTTPException(
                status.HTTP_422_UNPROCESSABLE_CONTENT,
                {"code": errors.SOURCE_NOT_CONFIGURED, "message": "No Twenty source is configured."},
            )
        try:
            attachment_id = str(uuid.UUID(body.source.id))
        except ValueError as error:
            raise HTTPException(status.HTTP_422_UNPROCESSABLE_CONTENT, "Twenty attachment ids are UUIDs.") from error
        # A Twenty user's own token decides access; the RedSky API has
        # already decided, so the service key only confirms the file exists.
        token = settings.twenty_api_key.get_secret_value() if caller.kind == GATEWAY else caller.twenty_token
        try:
            attachment = twenty.get_attachment(token, attachment_id)
        except (TwentyForbidden, TwentyNotFound) as error:
            raise HTTPException(status.HTTP_404_NOT_FOUND, "Attachment not found.") from error
        except TwentyUnauthenticated as error:
            raise HTTPException(status.HTTP_401_UNAUTHORIZED, "The token was rejected.") from error
        except TwentyError as error:
            raise HTTPException(
                status.HTTP_503_SERVICE_UNAVAILABLE, "RedSky could not read the attachment."
            ) from error
        return register(
            request,
            caller,
            source_system=TWENTY,
            source_id=attachment.id,
            filename=attachment.name,
            links=twenty_links(attachment),
            engine=body.engine,
            source_metadata={"fileId": attachment.file_id} if attachment.file_id else None,
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
        checks["sources"] = sorted(build_sources(settings, request.app.state.twenty))
        is_ready = checks["database"] == "ok" and checks["tesseract"] != "missing"
        return JSONResponse(
            {"status": "ready" if is_ready else "not_ready", "checks": checks},
            status_code=status.HTTP_200_OK if is_ready else status.HTTP_503_SERVICE_UNAVAILABLE,
        )

    @app.get("/api/v1/engines")
    def list_engines(caller: CurrentCaller) -> dict[str, Any]:
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
    def create_document(request: Request, caller: CurrentCaller, body: RegisterBody) -> JSONResponse:
        ensure_engine_enabled(body.engine)
        if body.source.system == STORAGE:
            return register_storage(request, caller, body)
        return register_twenty(request, caller, body)

    @app.get("/api/v1/documents")
    def list_documents(
        request: Request,
        caller: CurrentCaller,
        sourceSystem: Literal["storage", "twenty"] | None = None,
        sourceId: Annotated[str | None, Query(max_length=1024)] = None,
        linkSystem: Annotated[str | None, Query(max_length=32)] = None,
        linkObject: Annotated[str | None, Query(max_length=63)] = None,
        linkId: Annotated[str | None, Query(max_length=200)] = None,
        status_filter: Annotated[
            Literal["uploaded", "queued", "processing", "completed", "failed", "needs_review"] | None,
            Query(alias="status"),
        ] = None,
        limit: Annotated[int, Query(ge=1, le=MAX_LIST_LIMIT)] = 25,
    ) -> dict[str, Any]:
        with request.app.state.pool.connection() as connection:
            rows = repository.list_documents(
                connection,
                caller.tenant_id,
                source_system=sourceSystem,
                source_id=sourceId,
                link=(linkSystem, linkObject, linkId),
                status=status_filter,
                limit=limit,
            )
        visible = [row for row in rows if request.app.state.auth.can_read(caller, row)]
        return {"documents": document_responses(request, visible)}

    @app.get("/api/v1/documents/{document_id}")
    def get_document(request: Request, caller: CurrentCaller, document_id: uuid.UUID) -> dict[str, Any]:
        return document_responses(request, [load_document(request, caller, document_id)])[0]

    @app.delete("/api/v1/documents/{document_id}", status_code=status.HTTP_204_NO_CONTENT)
    def delete_document(request: Request, caller: CurrentCaller, document_id: uuid.UUID) -> Response:
        # The RedSky API deletes the original; this removes what was derived
        # from it.
        require_gateway(caller)
        with request.app.state.pool.connection() as connection:
            deleted = repository.delete_document(connection, caller.tenant_id, str(document_id))
        if deleted is None:
            raise HTTPException(status.HTTP_404_NOT_FOUND, "Document not found.")
        return Response(status_code=status.HTTP_204_NO_CONTENT)

    @app.get("/api/v1/documents/{document_id}/content")
    def get_content(
        request: Request,
        caller: CurrentCaller,
        document_id: uuid.UUID,
        format: Literal["json", "markdown", "text"] = "json",
        download: bool = False,
    ) -> Response:
        document = load_document(request, caller, document_id)
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
    def get_tables(request: Request, caller: CurrentCaller, document_id: uuid.UUID) -> dict[str, Any]:
        document = load_document(request, caller, document_id)
        extraction = current_extraction(request, document)
        with request.app.state.pool.connection() as connection:
            tables = repository.list_tables(connection, str(extraction["id"]))
        return {
            "documentId": str(document["id"]),
            "extractionId": str(extraction["id"]),
            "tables": [serialize_table(table) for table in tables],
        }

    @app.get("/api/v1/documents/{document_id}/chunks")
    def get_chunks(request: Request, caller: CurrentCaller, document_id: uuid.UUID) -> dict[str, Any]:
        document = load_document(request, caller, document_id)
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
        caller: CurrentCaller,
        document_id: uuid.UUID,
        body: ReprocessBody | None = None,
    ) -> JSONResponse:
        document = load_document(request, caller, document_id)
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
                requested_by=caller.user_id,
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
            document = repository.get_document(connection, caller.tenant_id, str(document["id"]))
        assert document is not None
        return JSONResponse(
            document_responses(request, [document])[0],
            status_code=status.HTTP_202_ACCEPTED if created else status.HTTP_200_OK,
        )

    @app.get("/api/v1/search")
    def search(
        request: Request,
        caller: CurrentCaller,
        q: Annotated[str, Query(min_length=2, max_length=500)],
        limit: Annotated[int, Query(ge=1, le=50)] = 20,
    ) -> dict[str, Any]:
        with request.app.state.pool.connection() as connection:
            # Over-fetch: hits the caller may not see are dropped below.
            rows = repository.search_pages(connection, caller.tenant_id, q, limit * 3)
        results = []
        for row in rows:
            if not request.app.state.auth.can_read(caller, row):
                continue
            results.append(
                {
                    "documentId": str(row["document_id"]),
                    "source": {"system": row["source_system"], "id": row["source_id"]},
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
        tenant_id = settings.twenty_tenant(workspace_id)
        with request.app.state.pool.connection() as connection:
            if event_name in ("attachment.deleted", "attachment.destroyed"):
                # Extracted text goes with the file it came from.
                deleted = repository.delete_document_by_source(connection, tenant_id, TWENTY, str(record["id"]))
                if deleted is None:
                    return "ignored"
                if settings.events_url:
                    repository.add_event(connection, deleted, "document.deleted")
                return "purged"
            if event_name not in ("attachment.created", "attachment.restored"):
                return "ignored"
            if not settings.auto_process_attachments:
                return "ignored"
            attachment = parse_attachment(record)
            if event.get("workspaceMemberId") and attachment.created_by_workspace_member_id is None:
                attachment = dataclasses.replace(
                    attachment, created_by_workspace_member_id=event["workspaceMemberId"]
                )
            if not register_twenty_attachment(connection, settings, tenant_id, attachment):
                return "duplicate"
            return "recorded_no_ai" if is_no_ai(attachment.name) else "queued"

    return app


def _dict_row():
    from psycopg.rows import dict_row

    return dict_row
