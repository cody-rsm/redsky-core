import dataclasses
from pathlib import Path
from typing import Any

from redsky_ocr.engines.base import EngineOptions
from redsky_ocr.engines.quality import assess
from redsky_ocr.engines.router import build_engines, select_engine
from redsky_ocr.validation import Limits, sniff


def run_extraction(
    path: Path,
    requested_engine: str,
    options: EngineOptions,
    limits: Limits,
    min_ocr_confidence: float,
) -> dict[str, Any]:
    sniffed = sniff(path.read_bytes(), limits)
    engines = build_engines(options)
    engine, reason = select_engine(requested_engine, sniffed.kind, engines)
    result = engine.extract(path, sniffed.kind)
    result.routing.update(
        {
            "requestedEngine": requested_engine,
            "selectedEngine": engine.name,
            "reason": reason,
            "mimeType": sniffed.mime_type,
        }
    )
    return {
        "mimeType": sniffed.mime_type,
        "result": dataclasses.asdict(result),
        "quality": assess(result, min_ocr_confidence),
    }
