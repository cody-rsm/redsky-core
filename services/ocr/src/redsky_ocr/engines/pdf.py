import math
import unicodedata
from dataclasses import asdict, dataclass
from pathlib import Path
from typing import Any

import pypdfium2 as pdfium
import pypdfium2.raw as pdfium_c
from PIL import Image

from redsky_ocr import errors
from redsky_ocr.errors import ProcessingError

# Fewer characters than this and the page is treated as having no text layer.
MIN_TEXT_CHARS = 25
# Below this share of letters, digits and ordinary punctuation the text layer
# is garbage (broken font encodings, "(cid:12)" runs) and must be OCRed.
MIN_TEXT_QUALITY = 0.6


@dataclass
class PageProbe:
    page_number: int
    width: float
    height: float
    char_count: int
    text_quality: float
    image_coverage: float
    needs_ocr: bool


@dataclass
class PdfPlan:
    page_count: int
    pages: list[PageProbe]

    @property
    def ocr_pages(self) -> list[int]:
        return [page.page_number for page in self.pages if page.needs_ocr]

    @property
    def classification(self) -> str:
        ocr_count = len(self.ocr_pages)
        if ocr_count == 0:
            return "digital"
        if ocr_count == self.page_count:
            return "scanned"
        return "mixed"

    @property
    def has_garbage_text_layer(self) -> bool:
        return any(
            page.needs_ocr and page.char_count >= MIN_TEXT_CHARS for page in self.pages
        )

    def summary(self) -> dict[str, Any]:
        return {
            "classification": self.classification,
            "pageCount": self.page_count,
            "ocrPages": self.ocr_pages,
            "pages": [asdict(page) for page in self.pages],
        }


def open_pdf(path: Path, max_pages: int) -> pdfium.PdfDocument:
    try:
        document = pdfium.PdfDocument(str(path))
    except pdfium.PdfiumError as error:
        if "password" in str(error).lower():
            raise ProcessingError(
                errors.ENCRYPTED_FILE,
                "The PDF is password-protected. Upload a copy without a password.",
            ) from error
        raise ProcessingError(errors.CORRUPT_FILE, "The PDF could not be opened.") from error
    if len(document) == 0:
        document.close()
        raise ProcessingError(errors.CORRUPT_FILE, "The PDF has no pages.")
    if len(document) > max_pages:
        page_count = len(document)
        document.close()
        raise ProcessingError(
            errors.TOO_MANY_PAGES,
            f"The PDF has {page_count} pages; the limit is {max_pages}.",
        )
    return document


def text_quality(text: str) -> float:
    visible = [character for character in text if not character.isspace()]
    if not visible:
        return 0.0
    good = 0
    for character in visible:
        category = unicodedata.category(character)
        if character == "�" or category in ("Co", "Cn", "Cc", "Cs"):
            continue
        if category[0] in ("L", "N", "P", "S"):
            good += 1
    quality = good / len(visible)
    if "(cid:" in text:
        quality = min(quality, 0.0)
    return quality


def probe(document: pdfium.PdfDocument) -> PdfPlan:
    pages: list[PageProbe] = []
    for index in range(len(document)):
        page = document[index]
        try:
            width, height = page.get_size()
            textpage = page.get_textpage()
            try:
                text = textpage.get_text_bounded()
            finally:
                textpage.close()
            char_count = sum(1 for character in text if not character.isspace())
            quality = text_quality(text)
            coverage = _image_coverage(page, width * height)
        finally:
            page.close()
        needs_ocr = char_count < MIN_TEXT_CHARS or quality < MIN_TEXT_QUALITY
        pages.append(
            PageProbe(
                page_number=index + 1,
                width=round(width, 2),
                height=round(height, 2),
                char_count=char_count,
                text_quality=round(quality, 3),
                image_coverage=round(coverage, 3),
                needs_ocr=needs_ocr,
            )
        )
    return PdfPlan(page_count=len(document), pages=pages)


def _image_coverage(page: pdfium.PdfPage, page_area: float) -> float:
    if page_area <= 0:
        return 0.0
    covered = 0.0
    for page_object in page.get_objects(filter=(pdfium_c.FPDF_PAGEOBJ_IMAGE,), max_depth=2):
        left, bottom, right, top = page_object.get_bounds()
        covered += max(0.0, right - left) * max(0.0, top - bottom)
    return min(1.0, covered / page_area)


def page_text(document: pdfium.PdfDocument, page_number: int) -> str:
    page = document[page_number - 1]
    try:
        textpage = page.get_textpage()
        try:
            return textpage.get_text_bounded()
        finally:
            textpage.close()
    finally:
        page.close()


def render_page(
    document: pdfium.PdfDocument, page_number: int, dpi: int, max_pixels: int
) -> Image.Image:
    page = document[page_number - 1]
    try:
        width, height = page.get_size()
        scale = dpi / 72
        # Oversized page boxes are a cheap way to make a renderer allocate
        # gigabytes; cap the bitmap instead of trusting the declared size.
        pixels = width * scale * height * scale
        if pixels > max_pixels:
            scale *= math.sqrt(max_pixels / pixels)
        bitmap = page.render(scale=scale, grayscale=True)
        try:
            return bitmap.to_pil()
        finally:
            bitmap.close()
    finally:
        page.close()
