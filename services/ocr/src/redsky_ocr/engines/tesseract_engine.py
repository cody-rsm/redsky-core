import tempfile
from importlib.metadata import version as package_version
from pathlib import Path

from PIL import Image, ImageOps, UnidentifiedImageError

from redsky_ocr import errors
from redsky_ocr.chunking import chunk_pages
from redsky_ocr.engines import pdf
from redsky_ocr.engines.base import EngineOptions, ExtractionResult, PageResult
from redsky_ocr.engines.tesseract import missing_languages, ocr_image, tesseract_version
from redsky_ocr.errors import ProcessingError
from redsky_ocr.validation import DocumentKind

# A single page should never take this long; the job timeout still applies.
PAGE_TIMEOUT_SECONDS = 300


class TesseractEngine:
    name = "tesseract"

    def __init__(self, options: EngineOptions) -> None:
        self.options = options

    def availability(self) -> str | None:
        if tesseract_version() is None:
            return "The tesseract binary is not installed."
        missing = missing_languages(self.options.ocr_languages)
        if missing:
            return f"Tesseract language data missing: {', '.join(missing)}."
        return None

    def version(self) -> str:
        return f"tesseract {tesseract_version()}; pypdfium2 {package_version('pypdfium2')}"

    def supports(self, kind: DocumentKind) -> bool:
        return kind in ("pdf", "image")

    def extract(self, path: Path, kind: DocumentKind) -> ExtractionResult:
        if kind == "pdf":
            pages, routing = self._extract_pdf(path)
        elif kind == "image":
            pages, routing = self._extract_image(path)
        else:
            raise ProcessingError(
                errors.ENGINE_UNAVAILABLE, "The tesseract engine reads PDFs and images only."
            )
        return ExtractionResult(
            engine=self.name,
            engine_version=self.version(),
            pages=pages,
            tables=[],
            markdown=join_pages_markdown(pages),
            plaintext="\n\n".join(page.text for page in pages),
            chunks=chunk_pages(pages),
            routing=routing,
            warnings=["Table structure is not extracted by the tesseract engine."],
        )

    def _extract_pdf(self, path: Path) -> tuple[list[PageResult], dict]:
        document = pdf.open_pdf(path, self.options.max_pages)
        try:
            plan = pdf.probe(document)
            pages: list[PageResult] = []
            for probe in plan.pages:
                if not probe.needs_ocr:
                    text = normalize_text(pdf.page_text(document, probe.page_number))
                    pages.append(
                        PageResult(
                            page_number=probe.page_number,
                            method="text_layer",
                            text=text,
                            markdown=text,
                            width=probe.width,
                            height=probe.height,
                        )
                    )
                    continue
                image = pdf.render_page(
                    document, probe.page_number, self.options.ocr_dpi, self.options.max_image_pixels
                )
                result = self._ocr(image)
                pages.append(
                    PageResult(
                        page_number=probe.page_number,
                        method="ocr",
                        text=result.text,
                        markdown=result.text,
                        ocr_confidence=result.confidence,
                        width=probe.width,
                        height=probe.height,
                    )
                )
            return pages, {"input": "pdf", **plan.summary()}
        finally:
            document.close()

    def _extract_image(self, path: Path) -> tuple[list[PageResult], dict]:
        pages: list[PageResult] = []
        for frame_number, image in enumerate(load_image_frames(path, self.options), start=1):
            result = self._ocr(image)
            pages.append(
                PageResult(
                    page_number=frame_number,
                    method="ocr",
                    text=result.text,
                    markdown=result.text,
                    ocr_confidence=result.confidence,
                    width=float(image.width),
                    height=float(image.height),
                )
            )
        return pages, {
            "input": "image",
            "classification": "scanned",
            "pageCount": len(pages),
            "ocrPages": [page.page_number for page in pages],
        }

    def _ocr(self, image: Image.Image):
        with tempfile.NamedTemporaryFile(
            suffix=".png", dir=self.options.work_dir, delete=True
        ) as handle:
            image.save(handle, format="PNG")
            handle.flush()
            return ocr_image(
                Path(handle.name),
                self.options.ocr_languages,
                self.options.ocr_dpi,
                min(PAGE_TIMEOUT_SECONDS, self.options.timeout_seconds),
            )


def load_image_frames(path: Path, options: EngineOptions):
    # Pillow refuses to decode beyond this, which is what stops pixel bombs.
    Image.MAX_IMAGE_PIXELS = options.max_image_pixels
    try:
        image = Image.open(path)
    except (UnidentifiedImageError, OSError) as error:
        raise ProcessingError(errors.CORRUPT_FILE, "The image could not be read.") from error
    except Image.DecompressionBombError as error:
        raise ProcessingError(errors.IMAGE_TOO_LARGE, "The image has too many pixels.") from error
    with image:
        if image.width * image.height > options.max_image_pixels:
            raise ProcessingError(errors.IMAGE_TOO_LARGE, "The image has too many pixels.")
        frame_count = getattr(image, "n_frames", 1)
        if frame_count > options.max_pages:
            raise ProcessingError(
                errors.TOO_MANY_PAGES,
                f"The image has {frame_count} pages; the limit is {options.max_pages}.",
            )
        for frame in range(frame_count):
            try:
                image.seek(frame)
                upright = ImageOps.exif_transpose(image)
                yield upright.convert("L")
            except (OSError, ValueError) as error:
                raise ProcessingError(errors.CORRUPT_FILE, "The image could not be read.") from error


def normalize_text(text: str) -> str:
    lines = [line.rstrip() for line in text.replace("\r\n", "\n").replace("\r", "\n").split("\n")]
    return "\n".join(lines).strip()


def join_pages_markdown(pages: list[PageResult]) -> str:
    if len(pages) == 1:
        return pages[0].markdown
    # HTML comments are invisible when rendered but keep page references in
    # copied or exported markdown.
    return "\n\n".join(f"<!-- page {page.page_number} -->\n\n{page.markdown}" for page in pages)
