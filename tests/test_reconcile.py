from datetime import UTC, datetime, timedelta

from redsky_ocr import repository
from redsky_ocr.worker import Worker


def documents(pool):
    with pool.connection() as connection:
        return connection.execute(
            "select attachment_id::text as attachment_id, status, no_ai from redsky_ocr.document order by filename"
        ).fetchall()


def iso(moment: datetime) -> str:
    return moment.isoformat(timespec="milliseconds").replace("+00:00", "Z")


def test_first_sweep_only_sets_the_cursor(pool, settings, twenty_client, fake_twenty, workspace_id):
    fake_twenty.add_attachment(workspace_id, "old.pdf", b"%PDF-1.7").created_at = iso(datetime.now(UTC) - timedelta(days=30))

    assert Worker(settings, pool, twenty_client).reconcile() == 0

    assert documents(pool) == []
    with pool.connection() as connection:
        assert repository.get_sync_cursor(connection, workspace_id) is not None


def test_sweep_queues_attachments_whose_webhook_never_arrived(pool, settings, twenty_client, fake_twenty, workspace_id):
    worker = Worker(settings, pool, twenty_client)
    worker.reconcile()
    missed = fake_twenty.add_attachment(workspace_id, "missed.pdf", b"%PDF-1.7")
    secret = fake_twenty.add_attachment(workspace_id, "terms_NOAI.pdf", b"%PDF-1.7")

    assert worker.reconcile() == 2
    assert worker.reconcile() == 0  # nothing twice

    assert documents(pool) == [
        {"attachment_id": missed.id, "status": "queued", "no_ai": False},
        {"attachment_id": secret.id, "status": "uploaded", "no_ai": True},
    ]


def test_sweep_pages_through_many_attachments(pool, settings, twenty_client, fake_twenty, workspace_id):
    worker = Worker(settings, pool, twenty_client)
    worker.reconcile()
    for index in range(130):
        fake_twenty.add_attachment(workspace_id, f"file-{index:03}.pdf", b"%PDF-1.7")

    assert worker.reconcile() == 130


def test_backfill_cursor_picks_up_older_files(pool, settings, twenty_client, fake_twenty, workspace_id):
    worker = Worker(settings, pool, twenty_client)
    worker.reconcile()
    old = fake_twenty.add_attachment(workspace_id, "old.pdf", b"%PDF-1.7")
    old.created_at = iso(datetime.now(UTC) - timedelta(days=30))
    assert worker.reconcile() == 0

    with pool.connection() as connection:
        repository.set_sync_cursor(connection, workspace_id, iso(datetime.now(UTC) - timedelta(days=60)))

    assert worker.reconcile() == 1


def test_sweep_is_off_without_auto_processing(pool, settings, twenty_client, fake_twenty, workspace_id):
    worker = Worker(settings.model_copy(update={"auto_process_attachments": False}), pool, twenty_client)

    assert worker.reconcile() == 0
    assert fake_twenty.calls == []


def test_backfill_accepts_dates_and_precise_timestamps(pool, settings, twenty_client, fake_twenty, workspace_id):
    worker = Worker(settings, pool, twenty_client)
    old = fake_twenty.add_attachment(workspace_id, "old.pdf", b"%PDF-1.7")
    old.created_at = iso(datetime.now(UTC) - timedelta(days=30))
    with pool.connection() as connection:
        # Postgres hands back microseconds; Twenty only takes milliseconds.
        repository.set_sync_cursor(connection, workspace_id, (datetime.now(UTC) - timedelta(days=45)).isoformat())

    assert worker.reconcile() == 1
