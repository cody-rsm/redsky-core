import dataclasses
import hashlib
import logging
import os
import shutil
import socket
import tempfile
import threading
import time
from datetime import datetime
from pathlib import Path
from typing import Any

from psycopg_pool import ConnectionPool

from redsky_ocr import errors, repository
from redsky_ocr.config import Settings
from redsky_ocr.errors import ProcessingError
from redsky_ocr.events import EventDelivery
from redsky_ocr.malware import scan_with_clamd
from redsky_ocr.runtime import engine_options, is_no_ai, limits
from redsky_ocr.sandbox import run_in_sandbox
from redsky_ocr.sources import TWENTY, DocumentSource, build_sources, twenty_links
from redsky_ocr.twenty import TwentyClient
from redsky_ocr.validation import sniff

logger = logging.getLogger(__name__)

HEARTBEAT_SECONDS = 15
# Several missed heartbeats before a job counts as abandoned.
STALE_SECONDS = 120
RECOVERY_INTERVAL_SECONDS = 60
# Any constant works; it keeps two workers from sweeping at the same time.
RECONCILE_LOCK_KEY = 7_311_852_005
# Re-read a little before the cursor: a row committed late can carry an
# earlier createdAt than one already seen. Registration is idempotent.
RECONCILE_OVERLAP = "2 minutes"
RECONCILE_MAX_PAGES = 20


class Worker:
    def __init__(
        self,
        settings: Settings,
        pool: ConnectionPool,
        twenty: TwentyClient | None,
        sources: dict[str, DocumentSource] | None = None,
        events: EventDelivery | None = None,
        worker_id: str | None = None,
    ) -> None:
        self.settings = settings
        self.pool = pool
        self.twenty = twenty
        self.sources = sources if sources is not None else build_sources(settings, twenty)
        if events is None and settings.events_url and settings.events_secret:
            events = EventDelivery(settings.events_url, settings.events_secret.get_secret_value())
        self.events = events
        self.worker_id = worker_id or f"{socket.gethostname()}:{os.getpid()}:{id(self):x}"
        self.engine_options = engine_options(settings)
        self.limits = limits(settings)
        self.last_recovery = 0.0
        self.last_reconcile = 0.0

    def run(self, stop: threading.Event) -> None:
        logger.info("worker started", extra={"worker": self.worker_id})
        while not stop.is_set():
            try:
                processed = self.run_once()
            except Exception:
                logger.exception("worker loop error")
                processed = False
            if not processed:
                stop.wait(self.settings.worker_poll_seconds)
        logger.info("worker stopped", extra={"worker": self.worker_id})

    def run_once(self) -> bool:
        if time.monotonic() - self.last_recovery > RECOVERY_INTERVAL_SECONDS:
            with self.pool.connection() as connection:
                recovered = repository.recover_stale(connection, STALE_SECONDS)
            if recovered:
                logger.warning("requeued abandoned jobs", extra={"count": recovered})
            self.last_recovery = time.monotonic()

        if (
            self.settings.reconcile_interval_seconds > 0
            and time.monotonic() - self.last_reconcile > self.settings.reconcile_interval_seconds
        ):
            self.last_reconcile = time.monotonic()
            try:
                self.reconcile_twenty()
            except Exception:
                logger.exception("reconciliation failed")

        if self.events is not None:
            try:
                self.events.deliver_due(self.pool)
            except Exception:
                logger.exception("event delivery failed")

        with self.pool.connection() as connection:
            job = repository.claim_next(connection, self.worker_id)
        if job is None:
            return False
        self.process(job)
        return True

    def process(self, job: dict[str, Any]) -> None:
        extraction_id = str(job["id"])
        started = time.monotonic()
        stop_heartbeat = threading.Event()
        heartbeat = threading.Thread(
            target=self._heartbeat, args=(extraction_id, stop_heartbeat), daemon=True
        )
        heartbeat.start()
        self.settings.work_dir.mkdir(parents=True, exist_ok=True, mode=0o700)
        job_dir = Path(tempfile.mkdtemp(prefix="job-", dir=self.settings.work_dir))
        outcome = "failed"
        error_code = None
        try:
            payload = self._extract(job, job_dir)
            with self.pool.connection() as connection:
                if repository.lock_owned(connection, extraction_id, self.worker_id):
                    outcome = repository.complete_extraction(connection, extraction_id, payload)
                    self._record_event(connection, str(job["document_id"]), outcome, extraction_id)
                else:
                    outcome = "abandoned"
        except ProcessingError as error:
            error_code = error.code
            outcome = self._fail(extraction_id, error.code, error.message, error.retryable)
        except Exception as error:
            error_code = errors.ENGINE_FAILED
            logger.exception("unexpected processing error", extra={"extraction": extraction_id})
            outcome = self._fail(
                extraction_id,
                errors.ENGINE_FAILED,
                f"Unexpected error ({type(error).__name__}).",
                True,
            )
        finally:
            stop_heartbeat.set()
            heartbeat.join(5)
            # Always remove the downloaded original and intermediate images.
            shutil.rmtree(job_dir, ignore_errors=True)
        # Identifiers and timings only: never filenames' content or text.
        logger.info(
            "job finished",
            extra={
                "extraction": extraction_id,
                "document": str(job["document_id"]),
                "attempt": job["attempts"],
                "outcome": outcome,
                "errorCode": error_code,
                "durationMs": int((time.monotonic() - started) * 1000),
            },
        )

    def _extract(self, job: dict[str, Any], job_dir: Path) -> dict[str, Any]:
        with self.pool.connection() as connection:
            document = connection.execute(
                "select * from redsky_ocr.document where id = %s", (job["document_id"],)
            ).fetchone()
        assert document is not None
        if document["no_ai"]:
            raise ProcessingError(
                errors.NO_AI_DOCUMENT, "The file is marked _NOAI; its content is never extracted."
            )
        source = self.sources.get(document["source_system"])
        if source is None:
            raise ProcessingError(
                errors.SOURCE_NOT_CONFIGURED,
                f"This deployment has no '{document['source_system']}' source configured.",
            )
        fetched = source.fetch(document, self.settings.max_file_bytes)
        data = fetched.data
        sniffed = sniff(data, self.limits)
        with self.pool.connection() as connection:
            repository.record_file_details(
                connection,
                str(document["id"]),
                size_bytes=len(data),
                sha256=hashlib.sha256(data).hexdigest(),
                mime_type=sniffed.mime_type,
                filename=fetched.filename,
                links=fetched.links,
                source_metadata=fetched.metadata,
            )
        if self.settings.clamav_host:
            scan_with_clamd(data, self.settings.clamav_host, self.settings.clamav_port)

        source = job_dir / f"source.{sniffed.extension}"
        source.write_bytes(data)
        os.chmod(source, 0o600)
        del data, fetched
        return run_in_sandbox(
            source,
            job["requested_engine"],
            # Page images go in the job directory too, so they are removed
            # with it even when the sandbox is killed mid-page.
            dataclasses.replace(self.engine_options, work_dir=job_dir),
            self.limits,
            self.settings.ocr_min_confidence,
            self.settings.job_memory_limit_mb,
            job_dir,
        )

    def reconcile_twenty(self) -> int:
        if (
            self.twenty is None
            or not self.settings.auto_process_attachments
            or self.settings.twenty_api_key is None
        ):
            return 0
        api_key = self.settings.twenty_api_key.get_secret_value()
        registered = 0
        with self.pool.connection() as connection:
            locked = connection.execute(
                "select pg_try_advisory_xact_lock(%s) as locked", (RECONCILE_LOCK_KEY,)
            ).fetchone()["locked"]
            if not locked:
                return 0
            tenant_id = self.settings.twenty_tenant(self.twenty.current_workspace_id(api_key))
            cursor = repository.get_sync_cursor(connection, TWENTY, tenant_id)
            if cursor is None:
                # First sweep: start from now. Older files are a deliberate
                # backfill (`redsky-ocr backfill --since`), not a side effect.
                now = connection.execute("select now() as now").fetchone()["now"].isoformat()
                repository.set_sync_cursor(connection, TWENTY, tenant_id, now)
                return 0
            since = connection.execute(
                "select (%s::timestamptz - %s::interval) as since", (cursor, RECONCILE_OVERLAP)
            ).fetchone()["since"].isoformat()
            newest = cursor
            after = None
            for _ in range(RECONCILE_MAX_PAGES):
                page, after = self.twenty.list_attachments_created_since(api_key, since, after)
                for attachment, created_at in page:
                    newest = max(newest, created_at, key=_timestamp)
                    if register_twenty_attachment(connection, self.settings, tenant_id, attachment):
                        registered += 1
                if after is None:
                    break
            repository.set_sync_cursor(connection, TWENTY, tenant_id, newest)
        if registered:
            logger.warning("queued attachments the webhook missed", extra={"count": registered})
        return registered

    def _fail(self, extraction_id: str, code: str, message: str, retryable: bool) -> str:
        with self.pool.connection() as connection:
            if not repository.lock_owned(connection, extraction_id, self.worker_id):
                return "abandoned"
            outcome = repository.fail_extraction(
                connection, extraction_id, code, message, retryable=retryable
            )
            if outcome == "failed":
                document_id = repository.get_extraction(connection, extraction_id)["document_id"]
                self._record_event(connection, str(document_id), outcome, extraction_id)
            return outcome

    def _record_event(
        self, connection, document_id: str, outcome: str, extraction_id: str
    ) -> None:
        if not self.settings.events_url:
            return
        document = connection.execute(
            "select * from redsky_ocr.document where id = %s", (document_id,)
        ).fetchone()
        repository.add_event(connection, document, f"document.{outcome}", extraction_id)

    def _heartbeat(self, extraction_id: str, stop: threading.Event) -> None:
        while not stop.wait(HEARTBEAT_SECONDS):
            try:
                with self.pool.connection() as connection:
                    repository.heartbeat(connection, extraction_id, self.worker_id)
            except Exception:
                logger.warning("heartbeat failed", extra={"extraction": extraction_id})


def register_twenty_attachment(connection, settings: Settings, tenant_id: str, attachment) -> bool:
    no_ai = is_no_ai(attachment.name)
    document, created = repository.create_document(
        connection,
        tenant_id=tenant_id,
        source_system=TWENTY,
        source_id=attachment.id,
        filename=attachment.name,
        links=twenty_links(attachment),
        uploaded_by=(
            f"twenty:{attachment.created_by_workspace_member_id}"
            if attachment.created_by_workspace_member_id
            else None
        ),
        no_ai=no_ai,
        source_metadata={"fileId": attachment.file_id} if attachment.file_id else None,
    )
    if created and not no_ai:
        repository.enqueue_extraction(
            connection,
            document_id=str(document["id"]),
            requested_engine=settings.default_engine,
            requested_by=None,
            max_attempts=settings.job_max_attempts,
        )
    return created


def _timestamp(value: str) -> datetime:
    return datetime.fromisoformat(value.replace("Z", "+00:00"))


def sweep_work_dir(work_dir: Path) -> None:
    # Leftovers from a process that was killed mid-job.
    if not work_dir.exists():
        return
    for entry in work_dir.iterdir():
        if entry.is_dir() and entry.name.startswith("job-"):
            shutil.rmtree(entry, ignore_errors=True)
