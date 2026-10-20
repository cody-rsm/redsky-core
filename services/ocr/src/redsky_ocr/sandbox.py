import json
import multiprocessing
import os
import signal
import traceback
from dataclasses import asdict
from pathlib import Path
from typing import Any

from redsky_ocr import errors
from redsky_ocr.engines.base import EngineOptions
from redsky_ocr.errors import ProcessingError
from redsky_ocr.validation import Limits

# Model weights are baked into the image; nothing may be fetched at runtime.
OFFLINE_ENVIRONMENT = {
    "HF_HUB_OFFLINE": "1",
    "TRANSFORMERS_OFFLINE": "1",
    "HF_HUB_DISABLE_TELEMETRY": "1",
    "DO_NOT_TRACK": "1",
}


def run_in_sandbox(
    path: Path,
    requested_engine: str,
    options: EngineOptions,
    limits: Limits,
    min_ocr_confidence: float,
    memory_limit_mb: int,
    work_dir: Path,
) -> dict[str, Any]:
    result_path = work_dir / "result.json"
    context = multiprocessing.get_context("spawn")
    process = context.Process(
        target=_child,
        args=(
            str(path),
            requested_engine,
            asdict(options),
            asdict(limits),
            min_ocr_confidence,
            memory_limit_mb,
            str(result_path),
        ),
        daemon=True,
    )
    process.start()
    process.join(options.timeout_seconds)
    if process.is_alive():
        # Only while the child is alive does its pid still name its group.
        _kill_group(process.pid)
        process.join(10)
        raise ProcessingError(
            errors.PROCESSING_TIMEOUT,
            f"Processing took longer than {options.timeout_seconds} seconds.",
        )

    if not result_path.exists():
        raise ProcessingError(
            errors.WORKER_CRASHED,
            f"The extraction process stopped unexpectedly (exit code {process.exitcode}).",
            retryable=True,
        )
    payload = json.loads(result_path.read_text())
    if "error" in payload:
        error = payload["error"]
        raise ProcessingError(error["code"], error["message"], retryable=error["retryable"])
    return payload


def _kill_group(pid: int | None) -> None:
    if pid is None:
        return
    try:
        os.killpg(pid, signal.SIGKILL)
    except (ProcessLookupError, PermissionError):
        pass


def _child(
    path: str,
    requested_engine: str,
    options: dict[str, Any],
    limits: dict[str, Any],
    min_ocr_confidence: float,
    memory_limit_mb: int,
    result_path: str,
) -> None:
    # Own process group, so a timeout kills Tesseract subprocesses too.
    os.setsid()
    os.environ.update(OFFLINE_ENVIRONMENT)
    if memory_limit_mb > 0:
        import resource

        limit = memory_limit_mb * 1024 * 1024
        resource.setrlimit(resource.RLIMIT_AS, (limit, limit))

    from redsky_ocr.pipeline import run_extraction

    engine_options = EngineOptions(
        **{
            **options,
            "work_dir": Path(options["work_dir"]),
            "docling_artifacts_path": (
                Path(options["docling_artifacts_path"])
                if options["docling_artifacts_path"]
                else None
            ),
        }
    )
    try:
        payload = run_extraction(
            Path(path),
            requested_engine,
            engine_options,
            Limits(**limits),
            min_ocr_confidence,
        )
    except ProcessingError as error:
        payload = {
            "error": {"code": error.code, "message": error.message, "retryable": error.retryable}
        }
    except MemoryError:
        payload = {
            "error": {
                "code": errors.ENGINE_FAILED,
                "message": "The document needed more memory than the limit allows.",
                "retryable": False,
            }
        }
    except Exception as error:
        # Only the exception type and code location are reported: library
        # messages can quote document text.
        frames = traceback.extract_tb(error.__traceback__)
        where = f"{frames[-1].filename.rsplit('/', 1)[-1]}:{frames[-1].lineno}" if frames else "?"
        payload = {
            "error": {
                "code": errors.ENGINE_FAILED,
                "message": f"Extraction failed ({type(error).__name__} at {where}).",
                "retryable": False,
            }
        }
    Path(result_path).write_text(json.dumps(payload))
