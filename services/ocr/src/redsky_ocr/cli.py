import argparse
import logging
import os
import signal
import socket
import threading

from redsky_ocr import policy, repository
from redsky_ocr.provision import provision
from redsky_ocr.config import get_settings
from redsky_ocr.db import create_pool, migrate
from redsky_ocr.logs import configure_logging
from redsky_ocr.twenty import TwentyClient
from redsky_ocr.worker import Worker, sweep_work_dir

logger = logging.getLogger(__name__)


def default_host() -> str:
    # "::" also accepts IPv4 and is what Railway's private network needs, but
    # not every host has IPv6 (Docker's default bridge network does not).
    try:
        with socket.socket(socket.AF_INET6, socket.SOCK_STREAM) as probe:
            probe.bind(("::", 0))
        return "::"
    except OSError:
        return "0.0.0.0"


def start_workers(settings, stop: threading.Event) -> list[threading.Thread]:
    pool = create_pool(settings.database_url.get_secret_value(), max_size=settings.worker_concurrency + 2)
    twenty = TwentyClient(
        settings.twenty_url,
        settings.twenty_timeout_seconds,
        settings.file_download_hosts,
        public_url=settings.twenty_public_url,
    )
    threads = []
    # Threads only orchestrate: each job runs in its own sandboxed process.
    for index in range(settings.worker_concurrency):
        worker = Worker(settings, pool, twenty)
        thread = threading.Thread(target=worker.run, args=(stop,), name=f"worker-{index}", daemon=True)
        thread.start()
        threads.append(thread)
    return threads


def backfill(settings, since: str | None) -> None:
    if not since or settings.twenty_api_key is None:
        raise SystemExit("backfill needs --since and REDSKY_OCR_TWENTY_API_KEY")
    twenty = TwentyClient(settings.twenty_url, settings.twenty_timeout_seconds)
    workspace_id = twenty.current_workspace_id(settings.twenty_api_key.get_secret_value())
    pool = create_pool(settings.database_url.get_secret_value(), max_size=1)
    with pool.connection() as connection:
        repository.set_sync_cursor(connection, workspace_id, since)
    pool.close()
    print(f"The next sweep queues attachments created since {since}.")


def main() -> None:
    parser = argparse.ArgumentParser(prog="redsky-ocr")
    parser.add_argument(
        "command",
        choices=["serve", "api", "worker", "migrate", "backfill"],
        help="serve: API and worker in one process; api or worker: one role only; "
        "backfill: queue attachments created since --since on the next sweep",
    )
    parser.add_argument("--since", help="backfill: ISO date or timestamp, e.g. 2026-01-01")
    arguments = parser.parse_args()
    command = arguments.command
    settings = get_settings()
    configure_logging(settings.log_level)
    policy.enforce(settings.docling_artifacts_path)
    if settings.admin_database_url is not None:
        provision(settings.admin_database_url.get_secret_value(), settings.database_url.get_secret_value())
        logger.warning("REDSKY_OCR_ADMIN_DATABASE_URL is set; remove it now that the database exists")
    migrate(settings.database_url.get_secret_value())
    if command == "migrate":
        return
    if command == "backfill":
        backfill(settings, arguments.since)
        return

    stop = threading.Event()
    run_api = command in ("serve", "api")
    run_workers = command == "worker" or (command == "serve" and settings.worker_enabled)
    if run_workers:
        sweep_work_dir(settings.work_dir)
        start_workers(settings, stop)

    if run_api:
        import uvicorn

        from redsky_ocr.api.app import create_app

        uvicorn.run(
            create_app(settings),
            host=os.environ.get("REDSKY_OCR_HOST") or default_host(),
            port=int(os.environ.get("PORT", "8080")),
            access_log=False,
            log_config=None,
            server_header=False,
        )
        stop.set()
        return

    signal.signal(signal.SIGTERM, lambda *_: stop.set())
    signal.signal(signal.SIGINT, lambda *_: stop.set())
    stop.wait()


if __name__ == "__main__":
    main()
