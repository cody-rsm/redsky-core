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
from redsky_ocr.malware import scan_with_clamd
from redsky_ocr.runtime import engine_options, is_no_ai, limits
from redsky_ocr.sandbox import run_in_sandbox
from redsky_ocr.twenty import FileTooLarge, TwentyClient, TwentyNotFound, TwentyUnavailable
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
        twenty: TwentyClient,
        worker_id: str | None = None,
    ) -> None:
        self.settings = settings
        self.pool = pool
        self.twenty = twenty
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
                self.reconcile()
            except Exception:
                logger.exception("reconciliation failed")

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
        if self.settings.twenty_api_key is None:
            raise ProcessingError(
                errors.SOURCE_UNAVAILABLE,
                "REDSKY_OCR_TWENTY_API_KEY is not set, so the file cannot be fetched.",
                retryable=True,
            )

        api_key = self.settings.twenty_api_key.get_secret_value()
        try:
            attachment = self.twenty.get_attachment(api_key, str(document["attachment_id"]))
            if not attachment.url:
                raise TwentyNotFound("The attachment has no file.")
            data = self.twenty.download(attachment.url, self.settings.max_file_bytes)
        except TwentyNotFound as error:
            raise ProcessingError(
                errors.SOURCE_DELETED, "The attachment or its file no longer exists in Twenty."
            ) from error
        except FileTooLarge as error:
            raise ProcessingError(
                errors.FILE_TOO_LARGE,
                f"The file is larger than the {self.settings.max_file_bytes // (1024 * 1024)} MB limit.",
            ) from error
        except TwentyUnavailable as error:
            raise ProcessingError(
                errors.SOURCE_UNAVAILABLE, "Twenty could not be reached.", retryable=True
            ) from error

        sniffed = sniff(data, self.limits)
        with self.pool.connection() as connection:
            repository.record_file_details(
                connection,
                str(document["id"]),
                filename=attachment.name,
                size_bytes=len(data),
                sha256=hashlib.sha256(data).hexdigest(),
                mime_type=sniffed.mime_type,
                linked_object=attachment.linked_object,
                linked_record_id=attachment.linked_record_id,
            )
        if self.settings.clamav_host:
            scan_with_clamd(data, self.settings.clamav_host, self.settings.clamav_port)

        source = job_dir / f"source.{sniffed.extension}"
        source.write_bytes(data)
        os.chmod(source, 0o600)
        del data
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

    def reconcile(self) -> int:
        if not self.settings.auto_process_attachments or self.settings.twenty_api_key is None:
            return 0
        api_key = self.settings.twenty_api_key.get_secret_value()
        registered = 0
        with self.pool.connection() as connection:
            locked = connection.execute(
                "select pg_try_advisory_xact_lock(%s) as locked", (RECONCILE_LOCK_KEY,)
            ).fetchone()["locked"]
            if not locked:
                return 0
            workspace_id = self.twenty.current_workspace_id(api_key)
            cursor = repository.get_sync_cursor(connection, workspace_id)
            if cursor is None:
                # First sweep: start from now. Older files are a deliberate
                # backfill (`redsky-ocr backfill --since`), not a side effect.
                now = connection.execute("select now() as now").fetchone()["now"].isoformat()
                repository.set_sync_cursor(connection, workspace_id, now)
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
                    if self._register(connection, workspace_id, attachment):
                        registered += 1
                if after is None:
                    break
            repository.set_sync_cursor(connection, workspace_id, newest)
        if registered:
            logger.warning("queued attachments the webhook missed", extra={"count": registered})
        return registered

    def _register(self, connection, workspace_id: str, attachment) -> bool:
        no_ai = is_no_ai(attachment.name)
        document, created = repository.create_document(
            connection,
            workspace_id=workspace_id,
            attachment_id=attachment.id,
            file_id=attachment.file_id,
            filename=attachment.name,
            linked_object=attachment.linked_object,
            linked_record_id=attachment.linked_record_id,
            uploaded_by_user_id=None,
            uploaded_by_workspace_member_id=attachment.created_by_workspace_member_id,
            no_ai=no_ai,
        )
        if created and not no_ai:
            repository.enqueue_extraction(
                connection,
                document_id=str(document["id"]),
                requested_engine=self.settings.default_engine,
                requested_by_workspace_member_id=None,
                max_attempts=self.settings.job_max_attempts,
            )
        return created

    def _fail(self, extraction_id: str, code: str, message: str, retryable: bool) -> str:
        with self.pool.connection() as connection:
            if not repository.lock_owned(connection, extraction_id, self.worker_id):
                return "abandoned"
            return repository.fail_extraction(
                connection, extraction_id, code, message, retryable=retryable
            )

    def _heartbeat(self, extraction_id: str, stop: threading.Event) -> None:
        while not stop.wait(HEARTBEAT_SECONDS):
            try:
                with self.pool.connection() as connection:
                    repository.heartbeat(connection, extraction_id, self.worker_id)
            except Exception:
                logger.warning("heartbeat failed", extra={"extraction": extraction_id})


def _timestamp(value: str) -> datetime:
    return datetime.fromisoformat(value.replace("Z", "+00:00"))


def sweep_work_dir(work_dir: Path) -> None:
    # Leftovers from a process that was killed mid-job.
    if not work_dir.exists():
        return
    for entry in work_dir.iterdir():
        if entry.is_dir() and entry.name.startswith("job-"):
            shutil.rmtree(entry, ignore_errors=True)
