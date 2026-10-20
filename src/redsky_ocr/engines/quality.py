from typing import Any

from redsky_ocr.engines.base import ExtractionResult
from redsky_ocr.engines.pdf import text_quality

OCR_METHODS = ("ocr", "layout_ocr", "vlm")
EMPTY_PAGE_CHARS = 5


def assess(result: ExtractionResult, min_ocr_confidence: float) -> dict[str, Any]:
    ocr_pages = [page for page in result.pages if page.method in OCR_METHODS]
    confidences = [page.ocr_confidence for page in ocr_pages if page.ocr_confidence is not None]
    mean_confidence = round(sum(confidences) / len(confidences), 2) if confidences else None
    low_pages = [
        page.page_number
        for page in ocr_pages
        if page.ocr_confidence is not None and page.ocr_confidence < min_ocr_confidence
    ]
    empty_pages = [
        page.page_number
        for page in result.pages
        if len(page.text.strip()) < EMPTY_PAGE_CHARS
    ]
    total_chars = sum(len(page.text.strip()) for page in result.pages)
    overall_text_quality = round(text_quality(result.plaintext), 3) if total_chars else 0.0

    flags: list[str] = []
    if total_chars == 0:
        flags.append("no_text")
    if mean_confidence is not None and mean_confidence < min_ocr_confidence:
        flags.append("low_ocr_confidence")
    if len(result.pages) > 1 and len(empty_pages) * 2 > len(result.pages):
        flags.append("mostly_empty_pages")
    if total_chars and overall_text_quality < 0.5:
        flags.append("garbled_text")

    return {
        "pageCount": len(result.pages),
        "ocrPageCount": len(ocr_pages),
        "meanOcrConfidence": mean_confidence,
        "lowConfidencePages": low_pages,
        "emptyPages": empty_pages,
        "characterCount": total_chars,
        "textQuality": overall_text_quality,
        "tableCount": len(result.tables),
        "flags": flags,
        "needsReview": bool(flags),
    }
