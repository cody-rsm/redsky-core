import pytest

from redsky_ocr import errors
from redsky_ocr.errors import ProcessingError
from redsky_ocr.validation import Limits, sniff

LIMITS = Limits(
    max_file_bytes=50 * 1024 * 1024,
    max_zip_entries=5_000,
    max_zip_uncompressed_bytes=300 * 1024 * 1024,
    max_zip_compression_ratio=150,
)


@pytest.mark.parametrize(
    ("name", "kind", "mime_type"),
    [
        ("native.pdf", "pdf", "application/pdf"),
        ("scanned.pdf", "pdf", "application/pdf"),
        ("letter.png", "image", "image/png"),
        ("letter.jpg", "image", "image/jpeg"),
        ("fax.tiff", "image", "image/tiff"),
        ("board-update.docx", "docx", "application/vnd.openxmlformats-officedocument.wordprocessingml.document"),
        ("pitch-deck.pptx", "pptx", "application/vnd.openxmlformats-officedocument.presentationml.presentation"),
        ("financials.xlsx", "xlsx", "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"),
    ],
)
def test_detects_supported_types_from_content(samples, name, kind, mime_type):
    sniffed = sniff(samples[name].path.read_bytes(), LIMITS)

    assert (sniffed.kind, sniffed.mime_type) == (kind, mime_type)


def test_ignores_the_file_extension(samples):
    # A PDF renamed to .docx is still read as a PDF.
    assert sniff(samples["native.pdf"].path.read_bytes(), LIMITS).kind == "pdf"


@pytest.mark.parametrize(
    ("content", "code"),
    [
        (b"", errors.EMPTY_FILE),
        (b"just some text, not a document", errors.UNSUPPORTED_TYPE),
        (b"\xd0\xcf\x11\xe0\xa1\xb1\x1a\xe1" + b"\x00" * 512, errors.UNSUPPORTED_TYPE),
        (b"PK\x03\x04 truncated zip", errors.CORRUPT_FILE),
    ],
)
def test_rejects_empty_unsupported_and_damaged_files(content, code):
    with pytest.raises(ProcessingError) as raised:
        sniff(content, LIMITS)

    assert raised.value.code == code


def test_rejects_files_over_the_size_limit():
    small = Limits(1024, 10, 10_000, 100)

    with pytest.raises(ProcessingError) as raised:
        sniff(b"%PDF-1.7" + b"\x00" * 2048, small)

    assert raised.value.code == errors.FILE_TOO_LARGE


def test_rejects_macro_enabled_office_files(samples):
    with pytest.raises(ProcessingError) as raised:
        sniff(samples["macro.docx"].path.read_bytes(), LIMITS)

    assert raised.value.code == errors.MACRO_ENABLED


def test_rejects_zip_bombs(samples):
    with pytest.raises(ProcessingError) as raised:
        sniff(samples["bomb.docx"].path.read_bytes(), LIMITS)

    assert raised.value.code == errors.ARCHIVE_BOMB


def test_rejects_archives_with_too_many_entries(samples):
    with pytest.raises(ProcessingError) as raised:
        sniff(samples["board-update.docx"].path.read_bytes(), Limits(50 * 1024 * 1024, 3, 10**9, 150))

    assert raised.value.code == errors.ARCHIVE_BOMB
