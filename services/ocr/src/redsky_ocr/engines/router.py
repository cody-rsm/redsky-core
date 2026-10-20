from redsky_ocr import errors
from redsky_ocr.engines.base import EngineOptions, ExtractionEngine
from redsky_ocr.engines.docling_engine import DoclingEngine
from redsky_ocr.engines.granite_engine import GraniteDoclingEngine
from redsky_ocr.engines.tesseract_engine import TesseractEngine
from redsky_ocr.errors import ProcessingError
from redsky_ocr.validation import DocumentKind


def build_engines(options: EngineOptions) -> dict[str, ExtractionEngine]:
    engines: list[ExtractionEngine] = [
        DoclingEngine(options),
        TesseractEngine(options),
        GraniteDoclingEngine(options),
    ]
    return {engine.name: engine for engine in engines}


def select_engine(
    requested: str, kind: DocumentKind, engines: dict[str, ExtractionEngine]
) -> tuple[ExtractionEngine, str]:
    if requested != "auto":
        engine = engines.get(requested)
        if engine is None:
            raise ProcessingError(errors.ENGINE_UNAVAILABLE, f"Unknown engine '{requested}'.")
        if not engine.supports(kind):
            reason = _unsupported_reason(engine, kind)
            raise ProcessingError(errors.ENGINE_UNAVAILABLE, reason)
        return engine, "requested"

    docling = engines["docling"]
    if kind in ("docx", "pptx", "xlsx"):
        # Office files carry their own structure; parsing it beats OCR.
        if docling.supports(kind):
            return docling, "office files are parsed natively"
        raise ProcessingError(errors.ENGINE_UNAVAILABLE, _unsupported_reason(docling, kind))
    if docling.supports(kind):
        return docling, "layout analysis available"
    tesseract = engines["tesseract"]
    if tesseract.supports(kind):
        return tesseract, "Docling layout models unavailable; text layer and Tesseract only"
    raise ProcessingError(errors.ENGINE_UNAVAILABLE, _unsupported_reason(tesseract, kind))


def _unsupported_reason(engine: ExtractionEngine, kind: DocumentKind) -> str:
    reason = engine.availability()
    if reason is None and isinstance(engine, DoclingEngine) and kind in ("pdf", "image"):
        reason = engine.layout_availability()
    return reason or f"The {engine.name} engine does not read {kind.upper()} files."
