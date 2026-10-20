import argparse
import json
import multiprocessing
import os
import platform
import re
import statistics
import sys
import tempfile
import time
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1] / "tests"))

from sample_documents import GOOD_DOCUMENTS, generate  # noqa: E402

from redsky_ocr.engines.base import EngineOptions  # noqa: E402
from redsky_ocr.engines.router import build_engines  # noqa: E402
from redsky_ocr.errors import ProcessingError  # noqa: E402
from redsky_ocr.validation import Limits, sniff  # noqa: E402

LIMITS = Limits(50 * 1024 * 1024, 5_000, 300 * 1024 * 1024, 150)


def word_recall(expected: list[str], text: str) -> float | None:
    if not expected:
        return None
    words = set(re.findall(r"[a-z0-9]+", text.lower()))
    return sum(1 for word in expected if word.lower() in words) / len(expected)


def _measure(path: str, engine_name: str, options: dict, expected: list[str], queue) -> None:
    import resource

    from redsky_ocr.engines.quality import assess

    engine_options = EngineOptions(
        **{**options, "work_dir": Path(options["work_dir"]),
           "docling_artifacts_path": Path(options["docling_artifacts_path"]) if options["docling_artifacts_path"] else None}
    )
    started = time.perf_counter()
    try:
        kind = sniff(Path(path).read_bytes(), LIMITS).kind
        result = build_engines(engine_options)[engine_name].extract(Path(path), kind)
        outcome = {
            "seconds": time.perf_counter() - started,
            "recall": word_recall(expected, result.plaintext),
            "pages": len(result.pages),
            "tables": len(result.tables),
            "methods": sorted({page.method for page in result.pages}),
            "flags": assess(result, 60)["flags"],
        }
    except ProcessingError as error:
        outcome = {"seconds": time.perf_counter() - started, "error": error.code}
    # ru_maxrss is in KiB on Linux; children covers the Tesseract processes.
    outcome["peakMb"] = round(
        max(
            resource.getrusage(resource.RUSAGE_SELF).ru_maxrss,
            resource.getrusage(resource.RUSAGE_CHILDREN).ru_maxrss,
        )
        / 1024
    )
    queue.put(outcome)


def measure(path: Path, engine: str, options: EngineOptions, expected: list[str]) -> dict:
    context = multiprocessing.get_context("spawn")
    queue = context.Queue()
    serializable = {key: (str(value) if isinstance(value, Path) else value) for key, value in options.__dict__.items()}
    process = context.Process(target=_measure, args=(str(path), engine, serializable, expected, queue))
    started = time.perf_counter()
    process.start()
    outcome = queue.get()
    process.join()
    # Includes interpreter start-up and imports, as a worker job would.
    outcome["wallSeconds"] = time.perf_counter() - started
    return outcome


def main() -> None:
    parser = argparse.ArgumentParser(description="Benchmark redsky-ocr engines on the synthetic dataset")
    parser.add_argument("--runs", type=int, default=3)
    parser.add_argument("--engines", default="tesseract,docling,granite_docling")
    parser.add_argument("--json", type=Path)
    arguments = parser.parse_args()

    with tempfile.TemporaryDirectory() as directory:
        samples = generate(Path(directory) / "samples", include_bad=False)
        options = EngineOptions(
            ocr_languages=["eng"],
            ocr_dpi=300,
            max_pages=500,
            max_image_pixels=60_000_000,
            work_dir=Path(directory),
            docling_artifacts_path=Path(os.environ["REDSKY_OCR_DOCLING_ARTIFACTS_PATH"])
            if os.environ.get("REDSKY_OCR_DOCLING_ARTIFACTS_PATH")
            else None,
            docling_table_structure=True,
            granite_docling_mode=os.environ.get("REDSKY_OCR_GRANITE_DOCLING_MODE", "off"),
            granite_docling_api_url=os.environ.get("REDSKY_OCR_GRANITE_DOCLING_API_URL"),
            granite_docling_api_key=os.environ.get("REDSKY_OCR_GRANITE_DOCLING_API_KEY"),
            timeout_seconds=900,
        )
        engines = build_engines(options)
        rows = []
        for engine_name in arguments.engines.split(","):
            engine = engines[engine_name]
            for name in GOOD_DOCUMENTS:
                sample = samples[name]
                kind = sniff(sample.path.read_bytes(), LIMITS).kind
                if not engine.supports(kind):
                    rows.append({"engine": engine_name, "document": name, "skipped": engine.availability() or f"{kind} not supported"})
                    continue
                runs = [measure(sample.path, engine_name, options, sample.expected_words) for _ in range(arguments.runs)]
                last = runs[-1]
                rows.append(
                    {
                        "engine": engine_name,
                        "document": name,
                        "medianSeconds": round(statistics.median(run["seconds"] for run in runs), 2),
                        "medianWallSeconds": round(statistics.median(run["wallSeconds"] for run in runs), 2),
                        "peakMb": max(run["peakMb"] for run in runs),
                        **{key: last.get(key) for key in ("recall", "pages", "tables", "methods", "flags", "error")},
                        "expectedTables": sample.expected_tables,
                    }
                )

    print(f"# redsky-ocr benchmark\n\n{platform.platform()}, {os.cpu_count()} CPUs, {arguments.runs} runs per document\n")
    print("| Engine | Document | Extract s (median) | With start-up s | Peak MB | Word recall | Pages | Tables (expected) | Methods | Flags |")
    print("|---|---|---|---|---|---|---|---|---|---|")
    for row in rows:
        if "skipped" in row:
            print(f"| {row['engine']} | {row['document']} | skipped: {row['skipped']} | | | | | | | |")
            continue
        recall = f"{row['recall']:.0%}" if row.get("recall") is not None else "n/a"
        print(
            f"| {row['engine']} | {row['document']} | {row['medianSeconds']} | {row['medianWallSeconds']} | {row['peakMb']} | "
            f"{row.get('error') or recall} | {row.get('pages')} | {row.get('tables')} ({row['expectedTables']}) | "
            f"{', '.join(row.get('methods') or [])} | {', '.join(row.get('flags') or [])} |"
        )
    if arguments.json:
        arguments.json.write_text(json.dumps(rows, indent=2))


if __name__ == "__main__":
    main()
