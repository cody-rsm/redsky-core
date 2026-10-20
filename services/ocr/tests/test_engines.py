import dataclasses
import re

import pytest

from redsky_ocr import errors
from redsky_ocr.chunking import chunk_pages
from redsky_ocr.engines.base import ExtractionResult, PageResult
from redsky_ocr.engines.docling_engine import DoclingEngine, layout_models_present
from redsky_ocr.engines.granite_engine import GraniteDoclingEngine
from redsky_ocr.engines.pdf import text_quality
from redsky_ocr.engines.quality import assess
from redsky_ocr.engines.router import build_engines, select_engine
from redsky_ocr.engines.tesseract_engine import TesseractEngine
from redsky_ocr.errors import ProcessingError


def word_recall(expected: list[str], text: str) -> float:
    words = set(re.findall(r"[a-z0-9]+", text.lower()))
    wanted = [word.lower() for word in expected]
    return sum(1 for word in wanted if word in words) / len(wanted)


def needs_models(options) -> None:
    if not layout_models_present(options.docling_artifacts_path):
        pytest.skip("Docling layout models are not on disk (set REDSKY_OCR_DOCLING_ARTIFACTS_PATH)")


def test_native_pdf_uses_the_text_layer_without_ocr(samples, options):
    sample = samples["native.pdf"]

    result = TesseractEngine(options).extract(sample.path, "pdf")

    assert [page.method for page in result.pages] == ["text_layer", "text_layer"]
    assert result.routing["classification"] == "digital"
    assert word_recall(sample.expected_words, result.plaintext) == 1.0
    assert "Recommendation" in result.pages[1].text


@pytest.mark.parametrize("name", ["scanned.pdf", "letter.png", "letter.jpg", "fax.tiff"])
def test_scans_and_images_are_ocred_accurately(samples, options, name):
    sample = samples[name]

    result = TesseractEngine(options).extract(sample.path, "pdf" if name.endswith(".pdf") else "image")

    assert len(result.pages) == sample.expected_pages
    assert {page.method for page in result.pages} == {"ocr"}
    assert word_recall(sample.expected_words, result.plaintext) >= 0.9
    assert all(page.ocr_confidence and page.ocr_confidence > 80 for page in result.pages)


def test_mixed_pdf_only_ocrs_the_scanned_page(samples, options):
    result = TesseractEngine(options).extract(samples["mixed.pdf"].path, "pdf")

    assert [page.method for page in result.pages] == ["text_layer", "ocr"]
    assert result.routing["classification"] == "mixed"
    assert result.routing["ocrPages"] == [2]
    assert word_recall(samples["mixed.pdf"].expected_words, result.plaintext) >= 0.9


def test_multipage_markdown_keeps_page_references(samples, options):
    result = TesseractEngine(options).extract(samples["scanned.pdf"].path, "pdf")

    assert "<!-- page 1 -->" in result.markdown and "<!-- page 2 -->" in result.markdown
    assert result.chunks[0].page_start == 1


def test_word_document_is_parsed_not_ocred(samples, options):
    result = DoclingEngine(options).extract(samples["board-update.docx"].path, "docx")

    assert [page.method for page in result.pages] == ["native"]
    assert re.match(r"^#+ Northwind Test Holdings Board Update\n", result.markdown)
    assert result.tables[0].cells == [
        ["Metric", "2025", "2026"],
        ["Revenue", "3,750", "4,200"],
        ["Gross margin", "58%", "61%"],
        ["Headcount", "41", "48"],
    ]
    assert result.docling_json is not None


def test_presentation_slides_become_pages(samples, options):
    result = DoclingEngine(options).extract(samples["pitch-deck.pptx"].path, "pptx")

    assert [page.page_number for page in result.pages] == [1, 2, 3]
    assert "Why now" in result.pages[1].markdown
    assert result.tables[0].page_number == 3
    assert word_recall(samples["pitch-deck.pptx"].expected_words, result.plaintext) == 1.0


def test_spreadsheet_sheets_become_tables(samples, options):
    result = DoclingEngine(options).extract(samples["financials.xlsx"].path, "xlsx")

    assert len(result.tables) == 2
    assert result.tables[1].cells[0] == ["Month", "Cash balance"]
    assert [table.page_number for table in result.tables] == [1, 2]


def test_office_chunks_carry_their_heading_path(samples, options):
    result = DoclingEngine(options).extract(samples["board-update.docx"].path, "docx")

    table_chunk = next(chunk for chunk in result.chunks if "Revenue" in chunk.text)
    assert table_chunk.headings[-1] == "Financial summary"


@pytest.mark.parametrize(
    ("name", "kind", "code"),
    [
        ("encrypted.pdf", "pdf", errors.ENCRYPTED_FILE),
        ("corrupt.pdf", "pdf", errors.CORRUPT_FILE),
        ("pixel-bomb.png", "image", errors.IMAGE_TOO_LARGE),
    ],
)
def test_unreadable_files_fail_with_a_specific_code(samples, options, name, kind, code):
    with pytest.raises(ProcessingError) as raised:
        TesseractEngine(options).extract(samples[name].path, kind)

    assert raised.value.code == code
    assert not raised.value.retryable


def test_page_limit_is_enforced(samples, options):
    with pytest.raises(ProcessingError) as raised:
        TesseractEngine(dataclasses.replace(options, max_pages=1)).extract(samples["scanned.pdf"].path, "pdf")

    assert raised.value.code == errors.TOO_MANY_PAGES


def test_blank_document_is_flagged_for_review(samples, options):
    result = TesseractEngine(options).extract(samples["blank.pdf"].path, "pdf")

    quality = assess(result, 60)

    assert quality["needsReview"]
    assert "no_text" in quality["flags"]


def test_low_ocr_confidence_is_flagged_for_review():
    result = ExtractionResult(
        engine="tesseract",
        engine_version="test",
        pages=[PageResult(1, "ocr", "smudged words here", "smudged words here", ocr_confidence=41.0)],
        tables=[],
        markdown="smudged words here",
        plaintext="smudged words here",
        chunks=[],
        routing={},
    )

    quality = assess(result, 60)

    assert quality["flags"] == ["low_ocr_confidence"]
    assert quality["lowConfidencePages"] == [1]


@pytest.mark.parametrize(
    ("text", "is_garbage"),
    [
        ("Revenue grew 12% to $4.2 million.", False),
        ("(cid:12)(cid:45)(cid:3)(cid:88)(cid:12)", True),
        (" ", True),
    ],
)
def test_broken_text_layers_are_recognised(text, is_garbage):
    assert (text_quality(text) < 0.6) is is_garbage


def test_chunks_respect_size_and_record_page_ranges():
    paragraph = "word " * 200
    pages = [PageResult(number, "ocr", f"{paragraph}\n\n{paragraph}", "") for number in (1, 2)]

    chunks = chunk_pages(pages, max_chars=1500)

    assert all(len(chunk.text) <= 1500 for chunk in chunks)
    assert chunks[0].page_start == 1 and chunks[-1].page_end == 2


def test_auto_routing_parses_office_files_with_docling(options):
    engine, _reason = select_engine("auto", "docx", build_engines(options))

    assert engine.name == "docling"


def test_auto_routing_falls_back_to_tesseract_without_layout_models(options):
    engines = build_engines(dataclasses.replace(options, docling_artifacts_path=None))

    engine, reason = select_engine("auto", "pdf", engines)

    assert engine.name == "tesseract"
    assert "unavailable" in reason


def test_explicit_engine_that_cannot_run_is_refused(options):
    engines = build_engines(dataclasses.replace(options, docling_artifacts_path=None))

    with pytest.raises(ProcessingError) as raised:
        select_engine("docling", "pdf", engines)

    assert raised.value.code == errors.ENGINE_UNAVAILABLE
    assert "layout" in raised.value.message


def test_granite_docling_is_off_by_default(options):
    engine = GraniteDoclingEngine(options)

    assert "turned off" in engine.availability()
    with pytest.raises(ProcessingError):
        select_engine("granite_docling", "pdf", build_engines(options))


def test_granite_docling_remote_mode_needs_an_endpoint(options):
    engine = GraniteDoclingEngine(dataclasses.replace(options, granite_docling_mode="remote"))

    assert "API_URL" in engine.availability()


@pytest.mark.docling_models
def test_docling_layout_extracts_pdf_tables_and_headings(samples, options):
    needs_models(options)

    result = DoclingEngine(options).extract(samples["native.pdf"].path, "pdf")

    assert {page.method for page in result.pages} == {"layout"}
    assert result.tables and result.tables[0].cells[1][0] == "Revenue"
    assert "## Summary" in result.markdown or "# Summary" in result.markdown


@pytest.mark.docling_models
def test_docling_layout_ocrs_scanned_pdfs_with_tesseract(samples, options):
    needs_models(options)

    result = DoclingEngine(options).extract(samples["scanned.pdf"].path, "pdf")

    assert {page.method for page in result.pages} == {"layout_ocr"}
    assert result.routing["ocrMode"] == "full_page"
    assert word_recall(samples["scanned.pdf"].expected_words, result.plaintext) >= 0.9
