import os
from importlib.metadata import version as package_version
from pathlib import Path
from typing import Any

from redsky_ocr import errors
from redsky_ocr.chunking import chunk_docling
from redsky_ocr.engines import pdf
from redsky_ocr.engines.base import (
    EngineOptions,
    ExtractionResult,
    PageMethod,
    PageResult,
    TableResult,
)
from redsky_ocr.engines.tesseract import missing_languages, tesseract_version
from redsky_ocr.engines.tesseract_engine import join_pages_markdown, load_image_frames
from redsky_ocr.errors import ProcessingError
from redsky_ocr.validation import DocumentKind

# Folder names under DOCLING_ARTIFACTS_PATH, as written by
# scripts/download_models.py (Docling's own "<org>--<repo>" convention).
LAYOUT_MODEL_FOLDER = "docling-project--docling-layout-heron"
TABLE_MODEL_FOLDER = "docling-project--docling-models"


def docling_version() -> str:
    return package_version("docling-slim")


def layout_models_present(artifacts_path: Path | None) -> bool:
    if artifacts_path is None:
        return False
    return (artifacts_path / LAYOUT_MODEL_FOLDER).is_dir() and (
        artifacts_path / TABLE_MODEL_FOLDER / "model_artifacts" / "tableformer"
    ).is_dir()


class DoclingEngine:
    name = "docling"

    def __init__(self, options: EngineOptions) -> None:
        self.options = options

    def availability(self) -> str | None:
        try:
            docling_version()
        except Exception:
            return "Docling is not installed."
        return None

    def layout_availability(self) -> str | None:
        if not layout_models_present(self.options.docling_artifacts_path):
            return (
                "Docling layout and table models are not on disk "
                "(REDSKY_OCR_DOCLING_ARTIFACTS_PATH)."
            )
        try:
            import torch  # noqa: F401
        except ImportError:
            return "torch is not installed; the Docling layout model needs it."
        if tesseract_version() is None:
            return "The tesseract binary is not installed."
        missing = missing_languages(self.options.ocr_languages)
        if missing:
            return f"Tesseract language data missing: {', '.join(missing)}."
        return None

    def version(self) -> str:
        return f"docling {docling_version()}"

    def supports(self, kind: DocumentKind) -> bool:
        if kind in ("docx", "pptx", "xlsx"):
            return self.availability() is None
        return self.layout_availability() is None

    def extract(self, path: Path, kind: DocumentKind) -> ExtractionResult:
        if kind in ("docx", "pptx", "xlsx"):
            return self._extract_office(path, kind)
        reason = self.layout_availability()
        if reason is not None:
            raise ProcessingError(errors.ENGINE_UNAVAILABLE, reason)
        if kind == "pdf":
            return self._extract_pdf(path)
        return self._extract_image(path)

    def _extract_office(self, path: Path, kind: DocumentKind) -> ExtractionResult:
        from docling.datamodel.base_models import InputFormat
        from docling.document_converter import DocumentConverter

        input_format = {
            "docx": InputFormat.DOCX,
            "pptx": InputFormat.PPTX,
            "xlsx": InputFormat.XLSX,
        }[kind]
        converter = DocumentConverter(allowed_formats=[input_format])
        result = self._convert(converter, path)
        return self._to_result(
            result,
            method_for_page=lambda _page_number: "native",
            routing={"input": kind, "classification": "native"},
            engine_version=self.version(),
        )

    def _extract_pdf(self, path: Path) -> ExtractionResult:
        from docling.datamodel.base_models import InputFormat
        from docling.datamodel.pipeline_options import OcrMode
        from docling.document_converter import DocumentConverter, PdfFormatOption

        document = pdf.open_pdf(path, self.options.max_pages)
        try:
            plan = pdf.probe(document)
        finally:
            document.close()

        ocr_pages = set(plan.ocr_pages)
        if plan.classification == "scanned" or plan.has_garbage_text_layer:
            ocr_mode = OcrMode.FULL_PAGE
        else:
            # Only layout regions without usable PDF text go to Tesseract, so
            # digital pages are never OCRed.
            ocr_mode = OcrMode.DEFAULT
        options = self._pipeline_options(do_ocr=bool(ocr_pages), ocr_mode=ocr_mode)
        converter = DocumentConverter(
            allowed_formats=[InputFormat.PDF],
            format_options={InputFormat.PDF: PdfFormatOption(pipeline_options=options)},
        )
        result = self._convert(converter, path)
        routing = {
            "input": "pdf",
            "ocrMode": ocr_mode.value if ocr_pages else None,
            **plan.summary(),
        }
        return self._to_result(
            result,
            method_for_page=lambda number: "layout_ocr" if number in ocr_pages else "layout",
            routing=routing,
            engine_version=self._layout_version(),
        )

    def _extract_image(self, path: Path) -> ExtractionResult:
        from docling.datamodel.base_models import InputFormat
        from docling.datamodel.pipeline_options import OcrMode
        from docling.document_converter import DocumentConverter, ImageFormatOption

        # Docling decodes images itself; check the pixel and frame limits
        # before it does.
        for _frame in load_image_frames(path, self.options):
            pass
        options = self._pipeline_options(do_ocr=True, ocr_mode=OcrMode.FULL_PAGE)
        converter = DocumentConverter(
            allowed_formats=[InputFormat.IMAGE],
            format_options={InputFormat.IMAGE: ImageFormatOption(pipeline_options=options)},
        )
        result = self._convert(converter, path)
        return self._to_result(
            result,
            method_for_page=lambda _page_number: "layout_ocr",
            routing={"input": "image", "classification": "scanned", "ocrMode": "full_page"},
            engine_version=self._layout_version(),
        )

    def _pipeline_options(self, *, do_ocr: bool, ocr_mode: Any):
        from docling.datamodel.accelerator_options import AcceleratorOptions
        from docling.datamodel.pipeline_options import (
            PdfPipelineOptions,
            TesseractCliOcrOptions,
        )

        return PdfPipelineOptions(
            artifacts_path=self.options.docling_artifacts_path,
            # No plugin loading and no network calls from inside Docling.
            enable_remote_services=False,
            allow_external_plugins=False,
            accelerator_options=AcceleratorOptions(
                device="cpu", num_threads=max(1, os.cpu_count() or 1)
            ),
            document_timeout=float(self.options.timeout_seconds),
            do_ocr=do_ocr,
            # Named explicitly: Docling's automatic choice would pick RapidOCR
            # or EasyOCR if either were ever installed.
            ocr_options=TesseractCliOcrOptions(lang=self.options.ocr_languages, mode=ocr_mode),
            do_table_structure=self.options.docling_table_structure,
            do_picture_classification=False,
            do_picture_description=False,
            do_chart_extraction=False,
            do_code_enrichment=False,
            do_formula_enrichment=False,
            generate_page_images=False,
            generate_picture_images=False,
        )

    def _layout_version(self) -> str:
        return f"docling {docling_version()}; layout heron; tableformer; tesseract {tesseract_version()}"

    def _convert(self, converter: Any, path: Path) -> Any:
        from docling.datamodel.base_models import ConversionStatus

        try:
            result = converter.convert(
                path, raises_on_error=False, max_num_pages=self.options.max_pages
            )
        except ProcessingError:
            raise
        except Exception as error:
            raise ProcessingError(
                errors.ENGINE_FAILED, f"Docling could not convert the file ({type(error).__name__})."
            ) from error
        if result.status not in (ConversionStatus.SUCCESS, ConversionStatus.PARTIAL_SUCCESS):
            raise ProcessingError(errors.ENGINE_FAILED, "Docling could not convert the file.")
        return result

    def _to_result(
        self,
        result: Any,
        *,
        method_for_page: Any,
        routing: dict[str, Any],
        engine_version: str,
    ) -> ExtractionResult:
        return docling_to_result(
            result,
            engine=self.name,
            engine_version=engine_version,
            method_for_page=method_for_page,
            routing=routing,
        )


def docling_to_result(
    result: Any,
    *,
    engine: str,
    engine_version: str,
    method_for_page: Any,
    routing: dict[str, Any],
) -> ExtractionResult:
    document = result.document
    page_scores = getattr(getattr(result, "confidence", None), "pages", {}) or {}
    pages: list[PageResult] = []
    page_numbers = sorted(document.pages.keys()) if document.pages else []
    if page_numbers:
        for number in page_numbers:
            method: PageMethod = method_for_page(number)
            size = document.pages[number].size
            confidence = None
            score = page_scores.get(number)
            if method in ("layout_ocr", "vlm") and score is not None:
                ocr_score = getattr(score, "ocr_score", None)
                if ocr_score is not None and ocr_score == ocr_score:
                    confidence = round(float(ocr_score) * 100, 2)
            pages.append(
                PageResult(
                    page_number=number,
                    method=method,
                    text=document.export_to_text(page_no=number),
                    markdown=document.export_to_markdown(page_no=number),
                    ocr_confidence=confidence,
                    width=round(size.width, 2) if size else None,
                    height=round(size.height, 2) if size else None,
                )
            )
    else:
        # Word documents have no pages until something lays them out.
        pages.append(
            PageResult(
                page_number=1,
                method=method_for_page(1),
                text=document.export_to_text(),
                markdown=document.export_to_markdown(),
            )
        )

    tables = []
    for table in document.tables:
        grid = table.data.grid if table.data else []
        tables.append(
            TableResult(
                page_number=table.prov[0].page_no if table.prov else None,
                cells=[[cell.text for cell in row] for row in grid],
                markdown=table.export_to_markdown(doc=document),
                caption=table.caption_text(document) or None,
            )
        )

    warnings = [
        f"{error.component_type.value}: {error.error_message}"
        for error in (getattr(result, "errors", None) or [])
    ]
    return ExtractionResult(
        engine=engine,
        engine_version=engine_version,
        pages=pages,
        tables=tables,
        markdown=join_pages_markdown(pages) if len(pages) > 1 else document.export_to_markdown(),
        plaintext="\n\n".join(page.text for page in pages),
        chunks=chunk_docling(document),
        routing=routing,
        docling_json=document.export_to_dict(),
        warnings=warnings,
    )
