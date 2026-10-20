import csv
import io
import shutil
import subprocess
from dataclasses import dataclass
from functools import lru_cache
from pathlib import Path

from redsky_ocr import errors
from redsky_ocr.errors import ProcessingError


@dataclass
class OcrText:
    text: str
    confidence: float | None
    word_count: int


@lru_cache
def tesseract_version() -> str | None:
    if shutil.which("tesseract") is None:
        return None
    output = subprocess.run(
        ["tesseract", "--version"], capture_output=True, text=True, timeout=10, check=False
    )
    first_line = (output.stdout or output.stderr).splitlines()[0:1]
    return first_line[0].removeprefix("tesseract ").strip() if first_line else "unknown"


@lru_cache
def installed_languages() -> frozenset[str]:
    if shutil.which("tesseract") is None:
        return frozenset()
    output = subprocess.run(
        ["tesseract", "--list-langs"], capture_output=True, text=True, timeout=10, check=False
    )
    lines = (output.stdout or "").splitlines()[1:]
    return frozenset(line.strip() for line in lines if line.strip())


def missing_languages(languages: list[str]) -> list[str]:
    available = installed_languages()
    return [language for language in languages if language not in available]


def ocr_image(image_path: Path, languages: list[str], dpi: int, timeout: float) -> OcrText:
    command = [
        "tesseract",
        str(image_path),
        "stdout",
        "-l",
        "+".join(languages),
        "--dpi",
        str(dpi),
        "--psm",
        "3",
        "tsv",
    ]
    try:
        completed = subprocess.run(
            command, capture_output=True, timeout=timeout, check=False
        )
    except subprocess.TimeoutExpired as error:
        raise ProcessingError(
            errors.PROCESSING_TIMEOUT, "OCR of a page took longer than allowed."
        ) from error
    if completed.returncode != 0:
        raise ProcessingError(errors.ENGINE_FAILED, "Tesseract could not read the page image.")
    return parse_tsv(completed.stdout.decode("utf-8", errors="replace"))


def parse_tsv(tsv: str) -> OcrText:
    # Tesseract's TSV has one row per word with its block, paragraph and line
    # numbers; rows with conf -1 are structural.
    paragraphs: dict[tuple[int, int, int], dict[int, list[str]]] = {}
    confidences: list[float] = []
    reader = csv.DictReader(io.StringIO(tsv), delimiter="\t", quoting=csv.QUOTE_NONE)
    for row in reader:
        word = (row.get("text") or "").strip()
        if not word:
            continue
        try:
            confidence = float(row["conf"])
            key = (int(row["page_num"]), int(row["block_num"]), int(row["par_num"]))
            line = int(row["line_num"])
        except (KeyError, TypeError, ValueError):
            continue
        if confidence >= 0:
            confidences.append(confidence)
        paragraphs.setdefault(key, {}).setdefault(line, []).append(word)

    blocks = []
    for key in sorted(paragraphs):
        lines = paragraphs[key]
        blocks.append("\n".join(" ".join(lines[number]) for number in sorted(lines)))
    text = "\n\n".join(blocks)
    confidence = round(sum(confidences) / len(confidences), 2) if confidences else None
    return OcrText(text=text, confidence=confidence, word_count=len(confidences))
