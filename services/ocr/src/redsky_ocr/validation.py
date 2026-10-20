import io
import zipfile
from dataclasses import dataclass
from typing import Literal

from redsky_ocr import errors
from redsky_ocr.errors import ProcessingError

DocumentKind = Literal["pdf", "image", "docx", "pptx", "xlsx"]

PDF = "application/pdf"
PNG = "image/png"
JPEG = "image/jpeg"
TIFF = "image/tiff"
DOCX = "application/vnd.openxmlformats-officedocument.wordprocessingml.document"
PPTX = "application/vnd.openxmlformats-officedocument.presentationml.presentation"
XLSX = "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"

OOXML_MAIN_PARTS = {
    "application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml": (
        "docx",
        DOCX,
    ),
    "application/vnd.openxmlformats-officedocument.presentationml.presentation.main+xml": (
        "pptx",
        PPTX,
    ),
    "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml": (
        "xlsx",
        XLSX,
    ),
}
OOXML_MACRO_PARTS = {
    "application/vnd.ms-word.document.macroEnabled.main+xml",
    "application/vnd.ms-word.template.macroEnabledTemplate.main+xml",
    "application/vnd.ms-powerpoint.presentation.macroEnabled.main+xml",
    "application/vnd.ms-powerpoint.slideshow.macroEnabled.main+xml",
    "application/vnd.ms-excel.sheet.macroEnabled.main+xml",
    "application/vnd.ms-excel.template.macroEnabled.main+xml",
}
OLE_SIGNATURE = b"\xd0\xcf\x11\xe0\xa1\xb1\x1a\xe1"


@dataclass(frozen=True)
class Limits:
    max_file_bytes: int
    max_zip_entries: int
    max_zip_uncompressed_bytes: int
    max_zip_compression_ratio: int


EXTENSIONS = {PDF: "pdf", PNG: "png", JPEG: "jpg", TIFF: "tiff", DOCX: "docx", PPTX: "pptx", XLSX: "xlsx"}


@dataclass(frozen=True)
class SniffedFile:
    kind: DocumentKind
    mime_type: str

    @property
    def extension(self) -> str:
        # Docling picks some Office backends by file extension.
        return EXTENSIONS[self.mime_type]


def sniff(data: bytes, limits: Limits) -> SniffedFile:
    if not data:
        raise ProcessingError(errors.EMPTY_FILE, "The file is empty.")
    if len(data) > limits.max_file_bytes:
        raise ProcessingError(
            errors.FILE_TOO_LARGE,
            f"The file is larger than the {limits.max_file_bytes // (1024 * 1024)} MB limit.",
        )

    # The PDF header may follow up to 1 KB of leading bytes.
    if b"%PDF-" in data[:1024]:
        return SniffedFile("pdf", PDF)
    if data.startswith(b"\x89PNG\r\n\x1a\n"):
        return SniffedFile("image", PNG)
    if data.startswith(b"\xff\xd8\xff"):
        return SniffedFile("image", JPEG)
    if data.startswith((b"II*\x00", b"MM\x00*")):
        return SniffedFile("image", TIFF)
    if data.startswith(b"PK\x03\x04"):
        return _sniff_ooxml(data, limits)
    if data.startswith(OLE_SIGNATURE):
        raise ProcessingError(
            errors.UNSUPPORTED_TYPE,
            "Legacy Office (.doc, .xls, .ppt) and password-protected Office files are not "
            "supported. Save the file as .docx, .xlsx or .pptx without a password.",
        )
    raise ProcessingError(
        errors.UNSUPPORTED_TYPE,
        "Unsupported file type. Supported: PDF, PNG, JPEG, TIFF, DOCX, PPTX, XLSX.",
    )


def _sniff_ooxml(data: bytes, limits: Limits) -> SniffedFile:
    try:
        archive = zipfile.ZipFile(io.BytesIO(data))
    except zipfile.BadZipFile as error:
        raise ProcessingError(errors.CORRUPT_FILE, "The file is a damaged ZIP archive.") from error

    with archive:
        entries = archive.infolist()
        _check_archive(entries, limits)
        names = {entry.filename for entry in entries}
        if "[Content_Types].xml" not in names:
            raise ProcessingError(
                errors.UNSUPPORTED_TYPE, "ZIP archives other than Office files are not supported."
            )
        if any(name.lower().endswith("vbaproject.bin") for name in names):
            raise ProcessingError(
                errors.MACRO_ENABLED, "Macro-enabled Office files are not accepted."
            )
        # Python's zipfile never yields more bytes than an entry declares, so
        # the size check above also bounds this read.
        content_types = archive.read("[Content_Types].xml").decode("utf-8", errors="replace")

    for macro_part in OOXML_MACRO_PARTS:
        if macro_part in content_types:
            raise ProcessingError(
                errors.MACRO_ENABLED, "Macro-enabled Office files are not accepted."
            )
    for main_part, (kind, mime_type) in OOXML_MAIN_PARTS.items():
        if main_part in content_types:
            return SniffedFile(kind, mime_type)
    raise ProcessingError(errors.UNSUPPORTED_TYPE, "This kind of Office file is not supported.")


def _check_archive(entries: list[zipfile.ZipInfo], limits: Limits) -> None:
    if len(entries) > limits.max_zip_entries:
        raise ProcessingError(errors.ARCHIVE_BOMB, "The archive has too many entries.")
    total = 0
    for entry in entries:
        total += entry.file_size
        if entry.compress_size > 0:
            ratio = entry.file_size / entry.compress_size
        else:
            ratio = 0 if entry.file_size == 0 else float("inf")
        if entry.file_size > 1024 * 1024 and ratio > limits.max_zip_compression_ratio:
            raise ProcessingError(
                errors.ARCHIVE_BOMB, "The archive expands far more than a real document would."
            )
    if total > limits.max_zip_uncompressed_bytes:
        raise ProcessingError(errors.ARCHIVE_BOMB, "The archive expands beyond the size limit.")
