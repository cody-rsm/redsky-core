from pathlib import Path

from redsky_ocr import errors
from redsky_ocr.engines.base import EngineOptions, ExtractionResult
from redsky_ocr.engines.docling_engine import docling_to_result, docling_version
from redsky_ocr.engines.tesseract_engine import load_image_frames
from redsky_ocr.engines import pdf
from redsky_ocr.errors import ProcessingError
from redsky_ocr.validation import DocumentKind

# The only VLM this service will run. Docling ships presets for other models,
# several of them Chinese-developed (Qwen, DeepSeek-OCR, GOT-OCR, MinerU);
# none of them is selectable here.
GRANITE_DOCLING_PRESET = "granite_docling"
GRANITE_DOCLING_REPO = "ibm-granite/granite-docling-258M"
GRANITE_DOCLING_FOLDER = "ibm-granite--granite-docling-258M"


class GraniteDoclingEngine:
    name = "granite_docling"

    def __init__(self, options: EngineOptions) -> None:
        self.options = options

    def availability(self) -> str | None:
        mode = self.options.granite_docling_mode
        if mode == "off":
            return "Granite Docling is turned off (REDSKY_OCR_GRANITE_DOCLING_MODE=off)."
        if mode == "remote":
            if not self.options.granite_docling_api_url:
                return "REDSKY_OCR_GRANITE_DOCLING_API_URL is not set."
            return None
        artifacts = self.options.docling_artifacts_path
        if artifacts is None or not (artifacts / GRANITE_DOCLING_FOLDER).is_dir():
            return "The Granite Docling model is not on disk."
        try:
            import torch  # noqa: F401
            import transformers  # noqa: F401
        except ImportError:
            return "torch and transformers are needed to run Granite Docling locally."
        return None

    def version(self) -> str:
        return (
            f"docling {docling_version()}; {GRANITE_DOCLING_REPO} "
            f"({self.options.granite_docling_mode})"
        )

    def supports(self, kind: DocumentKind) -> bool:
        return kind in ("pdf", "image") and self.availability() is None

    def extract(self, path: Path, kind: DocumentKind) -> ExtractionResult:
        reason = self.availability()
        if reason is not None:
            raise ProcessingError(errors.ENGINE_UNAVAILABLE, reason)
        if kind not in ("pdf", "image"):
            raise ProcessingError(
                errors.ENGINE_UNAVAILABLE, "Granite Docling reads PDFs and images only."
            )

        from docling.datamodel.base_models import ConversionStatus, InputFormat
        from docling.datamodel.pipeline_options import VlmConvertOptions, VlmPipelineOptions
        from docling.document_converter import (
            DocumentConverter,
            ImageFormatOption,
            PdfFormatOption,
        )
        from docling.pipeline.vlm_pipeline import VlmPipeline

        if kind == "pdf":
            document = pdf.open_pdf(path, self.options.max_pages)
            page_count = len(document)
            document.close()
        else:
            page_count = sum(1 for _frame in load_image_frames(path, self.options))

        remote = self.options.granite_docling_mode == "remote"
        if remote:
            from docling.datamodel.vlm_engine_options import ApiVlmEngineOptions

            headers = {}
            if self.options.granite_docling_api_key:
                headers["Authorization"] = f"Bearer {self.options.granite_docling_api_key}"
            engine_options = ApiVlmEngineOptions(
                url=self.options.granite_docling_api_url,
                headers=headers,
                params={"model": GRANITE_DOCLING_REPO},
                timeout=float(self.options.timeout_seconds),
            )
        else:
            from docling.datamodel.vlm_engine_options import TransformersVlmEngineOptions

            engine_options = TransformersVlmEngineOptions()

        pipeline_options = VlmPipelineOptions(
            artifacts_path=self.options.docling_artifacts_path,
            # The remote endpoint is RSM's own inference host; nothing else
            # is contacted.
            enable_remote_services=remote,
            allow_external_plugins=False,
            document_timeout=float(self.options.timeout_seconds),
            vlm_options=VlmConvertOptions.from_preset(
                GRANITE_DOCLING_PRESET, engine_options=engine_options
            ),
        )
        format_option = (
            PdfFormatOption if kind == "pdf" else ImageFormatOption
        )(pipeline_cls=VlmPipeline, pipeline_options=pipeline_options)
        input_format = InputFormat.PDF if kind == "pdf" else InputFormat.IMAGE
        converter = DocumentConverter(
            allowed_formats=[input_format], format_options={input_format: format_option}
        )
        try:
            result = converter.convert(
                path, raises_on_error=False, max_num_pages=self.options.max_pages
            )
        except Exception as error:
            raise ProcessingError(
                errors.ENGINE_FAILED,
                f"Granite Docling could not convert the file ({type(error).__name__}).",
            ) from error
        if result.status not in (ConversionStatus.SUCCESS, ConversionStatus.PARTIAL_SUCCESS):
            raise ProcessingError(errors.ENGINE_FAILED, "Granite Docling could not convert the file.")
        return docling_to_result(
            result,
            engine=self.name,
            engine_version=self.version(),
            method_for_page=lambda _page_number: "vlm",
            routing={"input": kind, "pageCount": page_count, "vlm": GRANITE_DOCLING_REPO},
        )
