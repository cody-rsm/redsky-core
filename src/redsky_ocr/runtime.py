import re

from redsky_ocr.config import Settings
from redsky_ocr.engines.base import EngineOptions
from redsky_ocr.validation import Limits

# The RSM Deal System's `_NOAI` filename tag: no AI processing anywhere, and
# nobody at RSM can waive it (RSM_ARCHITECTURE.md 12.7). Extracted text feeds
# RedSky's AI features, so these files are recorded but never extracted.
NO_AI_TAG = re.compile(r"(?:^|[_\-\s.])NOAI(?:[_\-\s.]|$)", re.IGNORECASE)


def is_no_ai(filename: str) -> bool:
    return bool(NO_AI_TAG.search(filename))


def engine_options(settings: Settings) -> EngineOptions:
    return EngineOptions(
        ocr_languages=list(settings.ocr_languages),
        ocr_dpi=settings.ocr_dpi,
        max_pages=settings.max_pages,
        max_image_pixels=settings.max_image_pixels,
        work_dir=settings.work_dir,
        docling_artifacts_path=settings.docling_artifacts_path,
        docling_table_structure=settings.docling_table_structure,
        granite_docling_mode=settings.granite_docling_mode,
        granite_docling_api_url=settings.granite_docling_api_url,
        granite_docling_api_key=(
            settings.granite_docling_api_key.get_secret_value()
            if settings.granite_docling_api_key
            else None
        ),
        timeout_seconds=settings.job_timeout_seconds,
    )


def limits(settings: Settings) -> Limits:
    return Limits(
        max_file_bytes=settings.max_file_bytes,
        max_zip_entries=settings.max_zip_entries,
        max_zip_uncompressed_bytes=settings.max_zip_uncompressed_bytes,
        max_zip_compression_ratio=settings.max_zip_compression_ratio,
    )
