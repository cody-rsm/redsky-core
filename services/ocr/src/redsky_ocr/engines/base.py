from dataclasses import dataclass, field
from pathlib import Path
from typing import Any, Literal, Protocol

from redsky_ocr.validation import DocumentKind

# text_layer: embedded PDF text. ocr: Tesseract on a rendered page or image.
# native: parsed Office structure. layout: Docling layout analysis over the
# text layer. layout_ocr: Docling layout with Tesseract on bitmap regions.
# vlm: Granite Docling.
PageMethod = Literal["text_layer", "ocr", "native", "layout", "layout_ocr", "vlm"]


@dataclass
class PageResult:
    page_number: int
    method: PageMethod
    text: str
    markdown: str
    ocr_confidence: float | None = None
    width: float | None = None
    height: float | None = None


@dataclass
class TableResult:
    page_number: int | None
    cells: list[list[str]]
    markdown: str
    caption: str | None = None


@dataclass
class ChunkResult:
    text: str
    headings: list[str]
    page_start: int | None
    page_end: int | None


@dataclass
class ExtractionResult:
    engine: str
    engine_version: str
    pages: list[PageResult]
    tables: list[TableResult]
    markdown: str
    plaintext: str
    chunks: list[ChunkResult]
    routing: dict[str, Any]
    docling_json: dict[str, Any] | None = None
    warnings: list[str] = field(default_factory=list)


@dataclass(frozen=True)
class EngineOptions:
    ocr_languages: list[str]
    ocr_dpi: int
    max_pages: int
    max_image_pixels: int
    work_dir: Path
    docling_artifacts_path: Path | None
    docling_table_structure: bool
    granite_docling_mode: str
    granite_docling_api_url: str | None
    granite_docling_api_key: str | None
    timeout_seconds: int


class ExtractionEngine(Protocol):
    name: str

    def availability(self) -> str | None:
        # None when usable, otherwise the reason it is not.
        ...

    def version(self) -> str: ...

    def supports(self, kind: DocumentKind) -> bool: ...

    def extract(self, path: Path, kind: DocumentKind) -> ExtractionResult: ...
