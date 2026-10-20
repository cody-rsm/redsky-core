import json
import logging
import sys
from datetime import UTC, datetime

STANDARD_ATTRIBUTES = set(
    logging.LogRecord("", 0, "", 0, "", None, None).__dict__
) | {"message", "asctime", "taskName"}


class JsonFormatter(logging.Formatter):
    def format(self, record: logging.LogRecord) -> str:
        entry = {
            "time": datetime.fromtimestamp(record.created, UTC).isoformat(),
            "level": record.levelname,
            "logger": record.name,
            "message": record.getMessage(),
        }
        for key, value in record.__dict__.items():
            if key not in STANDARD_ATTRIBUTES:
                entry[key] = value
        if record.exc_info and record.exc_info[0] is not None:
            # The exception type and where it happened; not its message, which
            # third-party parsers sometimes fill with document text.
            entry["exception"] = record.exc_info[0].__name__
            trace = record.exc_info[2]
            while trace is not None and trace.tb_next is not None:
                trace = trace.tb_next
            if trace is not None:
                entry["at"] = f"{trace.tb_frame.f_code.co_filename.rsplit('/', 1)[-1]}:{trace.tb_lineno}"
        return json.dumps(entry, default=str)


def configure_logging(level: str) -> None:
    handler = logging.StreamHandler(sys.stdout)
    handler.setFormatter(JsonFormatter())
    root = logging.getLogger()
    root.handlers[:] = [handler]
    root.setLevel(level.upper())
    # Docling and its dependencies log per-page detail at INFO.
    for noisy in ("docling", "docling_core", "docling_parse", "httpx", "httpcore"):
        logging.getLogger(noisy).setLevel(logging.WARNING)
