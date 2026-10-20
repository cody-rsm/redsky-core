import socket
import threading
import uuid

import pytest
from conftest import BUCKET
from sample_documents import LETTER_PAGES, render_scan

from redsky_ocr import errors, repository
from redsky_ocr.worker import Worker


def register(pool, tenant_id, attachment, no_ai=False, source_system="twenty", filename=None):
    with pool.connection() as connection:
        document, _ = repository.create_document(
            connection,
            tenant_id=tenant_id,
            source_system=source_system,
            source_id=attachment.id if hasattr(attachment, "id") else attachment,
            filename=filename or getattr(attachment, "name", "missing.pdf"),
            links=[],
            uploaded_by=None,
            no_ai=no_ai,
        )
        repository.enqueue_extraction(
            connection,
            document_id=str(document["id"]),
            requested_engine="auto",
            requested_by=None,
            max_attempts=3,
        )
    return document


def links(pool, document):
    with pool.connection() as connection:
        return repository.links_for(connection, [str(document["id"])])[str(document["id"])]


def state(pool, document):
    with pool.connection() as connection:
        stored = connection.execute(
            "select * from redsky_ocr.document where id = %s", (document["id"],)
        ).fetchone()
        latest = repository.latest_extraction(connection, str(document["id"]))
    return stored, latest


def test_worker_extracts_and_cleans_up(pool, settings, twenty_client, fake_twenty, workspace_id, samples):
    attachment = fake_twenty.add_attachment(workspace_id, "scanned.pdf", samples["scanned.pdf"].path.read_bytes())
    document = register(pool, workspace_id, attachment)

    assert Worker(settings, pool, twenty_client).run_once()

    stored, latest = state(pool, document)
    assert stored["status"] == "completed" and stored["sha256"]
    assert links(pool, document)[0].object == "company"
    assert stored["source_metadata"] == {"fileId": attachment.file_id}
    assert latest["engine"] == "tesseract" and latest["page_count"] == 2
    # The downloaded original and page images are gone.
    assert list(settings.work_dir.iterdir()) == []


def test_file_is_fetched_over_the_private_url(pool, settings, twenty_client, fake_twenty, workspace_id, samples):
    attachment = fake_twenty.add_attachment(workspace_id, "letter.png", samples["letter.png"].path.read_bytes())
    register(pool, workspace_id, attachment)

    Worker(settings, pool, twenty_client).run_once()

    # The signed URL names the public host; the fetch went to the private one.
    assert f"GET /file/files-field/{attachment.file_id}" in fake_twenty.calls


def test_deleted_source_fails_without_retry(pool, settings, twenty_client, workspace_id):
    document = register(pool, workspace_id, str(uuid.uuid4()))

    Worker(settings, pool, twenty_client).run_once()

    stored, latest = state(pool, document)
    assert stored["status"] == "failed" and latest["error_code"] == errors.SOURCE_DELETED


def test_twenty_outage_is_retried(pool, settings, twenty_client, fake_twenty, workspace_id, samples):
    attachment = fake_twenty.add_attachment(workspace_id, "letter.png", samples["letter.png"].path.read_bytes())
    document = register(pool, workspace_id, attachment)
    fake_twenty.available = False

    Worker(settings, pool, twenty_client).run_once()

    stored, latest = state(pool, document)
    assert stored["status"] == "queued"
    assert latest["attempts"] == 1 and latest["error_code"] == errors.SOURCE_UNAVAILABLE


def test_no_ai_documents_are_never_fetched(pool, settings, twenty_client, fake_twenty, workspace_id, samples):
    attachment = fake_twenty.add_attachment(workspace_id, "terms_NOAI.pdf", samples["native.pdf"].path.read_bytes())
    document = register(pool, workspace_id, attachment, no_ai=True)

    Worker(settings, pool, twenty_client).run_once()

    _, latest = state(pool, document)
    assert latest["error_code"] == errors.NO_AI_DOCUMENT
    assert not any(attachment.id in call or attachment.file_id in call for call in fake_twenty.calls)


def test_corrupt_file_fails_permanently(pool, settings, twenty_client, fake_twenty, workspace_id, samples):
    attachment = fake_twenty.add_attachment(workspace_id, "corrupt.pdf", samples["corrupt.pdf"].path.read_bytes())
    document = register(pool, workspace_id, attachment)

    Worker(settings, pool, twenty_client).run_once()

    stored, latest = state(pool, document)
    assert stored["status"] == "failed" and latest["error_code"] == errors.CORRUPT_FILE


def test_processing_timeout_kills_the_job(pool, settings, twenty_client, fake_twenty, workspace_id, tmp_path):
    long_scan = tmp_path / "long-scan.pdf"
    pages = [render_scan(LETTER_PAGES[index % 2], seed=index) for index in range(12)]
    pages[0].save(long_scan, format="PDF", save_all=True, append_images=pages[1:])
    attachment = fake_twenty.add_attachment(workspace_id, "long-scan.pdf", long_scan.read_bytes())
    document = register(pool, workspace_id, attachment)

    Worker(settings.model_copy(update={"job_timeout_seconds": 2}), pool, twenty_client).run_once()

    stored, latest = state(pool, document)
    assert stored["status"] == "failed" and latest["error_code"] == errors.PROCESSING_TIMEOUT
    assert list(settings.work_dir.iterdir()) == []


class FakeClamd:
    def __init__(self, verdict: bytes) -> None:
        self.server = socket.socket()
        self.server.bind(("127.0.0.1", 0))
        self.server.listen(1)
        self.port = self.server.getsockname()[1]
        self.verdict = verdict
        threading.Thread(target=self.serve, daemon=True).start()

    def serve(self) -> None:
        connection, _ = self.server.accept()
        with connection:
            received = b""
            while not received.endswith(b"\x00\x00\x00\x00"):
                received += connection.recv(65536)
            connection.sendall(self.verdict)


@pytest.mark.parametrize(
    ("verdict", "code"),
    [(b"stream: Eicar-Test-Signature FOUND\0", errors.MALWARE_DETECTED), (b"stream: OK\0", None)],
)
def test_malware_scan_blocks_infected_files(pool, settings, twenty_client, fake_twenty, workspace_id, samples, verdict, code):
    clamd = FakeClamd(verdict)
    attachment = fake_twenty.add_attachment(workspace_id, "letter.png", samples["letter.png"].path.read_bytes())
    document = register(pool, workspace_id, attachment)

    Worker(
        settings.model_copy(update={"clamav_host": "127.0.0.1", "clamav_port": clamd.port}), pool, twenty_client
    ).run_once()

    stored, latest = state(pool, document)
    assert latest["error_code"] == code
    assert stored["status"] == ("failed" if code else "completed")


def test_unreachable_scanner_fails_closed_and_retries(pool, settings, twenty_client, fake_twenty, workspace_id, samples):
    attachment = fake_twenty.add_attachment(workspace_id, "letter.png", samples["letter.png"].path.read_bytes())
    document = register(pool, workspace_id, attachment)

    Worker(settings.model_copy(update={"clamav_host": "127.0.0.1", "clamav_port": 1}), pool, twenty_client).run_once()

    stored, latest = state(pool, document)
    assert stored["status"] == "queued" and latest["error_code"] == errors.MALWARE_SCAN_FAILED


def test_worker_reads_originals_from_the_documents_bucket(pool, settings, twenty_client, workspace_id, samples, s3):
    key = f"documents/{uuid.uuid4()}/letter.jpg"
    s3.put_object(Bucket=BUCKET, Key=key, Body=samples["letter.jpg"].path.read_bytes())
    document = register(pool, workspace_id, key, source_system="storage", filename="letter.jpg")

    Worker(settings, pool, twenty_client).run_once()

    stored, latest = state(pool, document)
    assert stored["status"] == "completed" and latest["engine"] == "tesseract"
    assert stored["filename"] == "letter.jpg" and stored["mime_type"] == "image/jpeg"


def test_missing_stored_object_fails_without_retry(pool, settings, twenty_client, workspace_id):
    document = register(pool, workspace_id, "documents/gone.pdf", source_system="storage", filename="gone.pdf")

    Worker(settings, pool, twenty_client).run_once()

    stored, latest = state(pool, document)
    assert stored["status"] == "failed" and latest["error_code"] == errors.SOURCE_DELETED


def test_oversized_stored_object_is_refused(pool, settings, twenty_client, workspace_id, s3):
    key = "documents/huge.pdf"
    s3.put_object(Bucket=BUCKET, Key=key, Body=b"%PDF-1.7" + b"\x00" * 4096)
    document = register(pool, workspace_id, key, source_system="storage", filename="huge.pdf")

    Worker(settings.model_copy(update={"max_file_bytes": 1024}), pool, twenty_client).run_once()

    _, latest = state(pool, document)
    assert latest["error_code"] == errors.FILE_TOO_LARGE


def test_unconfigured_source_fails_clearly(pool, settings, twenty_client, workspace_id):
    document = register(pool, workspace_id, "documents/a.pdf", source_system="storage", filename="a.pdf")

    Worker(settings, pool, twenty_client, sources={}).run_once()

    _, latest = state(pool, document)
    assert latest["error_code"] == errors.SOURCE_NOT_CONFIGURED
