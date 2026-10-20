from importlib.metadata import distributions
from pathlib import Path

# RSM does not use Chinese-developed OCR engines, document models or model
# hubs. Docling can load several of these; they must never be installed.
FORBIDDEN_DISTRIBUTIONS = {
    "rapidocr",
    "rapidocr-onnxruntime",
    "rapidocr-paddle",
    "paddleocr",
    "paddlepaddle",
    "paddlepaddle-gpu",
    "paddlex",
    "qwen-vl-utils",
    "modelscope",
    "magic-pdf",
    "mineru",
    "deepseek-ocr",
    # Not Chinese-developed, but an OCR engine RSM has not reviewed; Docling
    # would pick it automatically if present.
    "easyocr",
}

# Model folders allowed under the Docling artifacts path, by HuggingFace repo.
ALLOWED_MODEL_FOLDERS = {
    "docling-project--docling-layout-heron",
    "docling-project--docling-layout-heron-onnx",
    "docling-project--docling-models",
    "ibm-granite--granite-docling-258M",
}


def _normalize(name: str) -> str:
    return name.lower().replace("_", "-").replace(".", "-")


def forbidden_installed() -> list[str]:
    installed = {_normalize(dist.metadata["Name"] or "") for dist in distributions()}
    return sorted(installed & FORBIDDEN_DISTRIBUTIONS)


def unexpected_models(artifacts_path: Path | None) -> list[str]:
    if artifacts_path is None or not artifacts_path.is_dir():
        return []
    return sorted(
        entry.name
        for entry in artifacts_path.iterdir()
        if entry.is_dir() and not entry.name.startswith(".") and entry.name not in ALLOWED_MODEL_FOLDERS
    )


def enforce(artifacts_path: Path | None) -> None:
    problems = []
    forbidden = forbidden_installed()
    if forbidden:
        problems.append(f"forbidden packages installed: {', '.join(forbidden)}")
    unexpected = unexpected_models(artifacts_path)
    if unexpected:
        problems.append(f"unreviewed model folders present: {', '.join(unexpected)}")
    if problems:
        raise SystemExit("redsky-ocr dependency policy violated: " + "; ".join(problems))
