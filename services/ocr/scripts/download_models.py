import json
import os
import sys
from pathlib import Path

from huggingface_hub import HfApi, snapshot_download

from redsky_ocr.policy import ALLOWED_MODEL_FOLDERS, unexpected_models

# Runs at image build time only; the running service never downloads models.
# Every repository here is IBM's. Docling's own downloader is not used because
# its defaults also fetch RapidOCR (PaddleOCR) weights. Pin the revisions to
# commit SHAs from manifest.json once a build has been reviewed.
LAYOUT = ("docling-project/docling-layout-heron", os.environ.get("LAYOUT_MODEL_REVISION", "main"), None)
TABLEFORMER = (
    "docling-project/docling-models",
    os.environ.get("TABLEFORMER_MODEL_REVISION", "v2.3.0"),
    ["model_artifacts/tableformer/**"],
)
GRANITE_DOCLING = (
    "ibm-granite/granite-docling-258M",
    os.environ.get("GRANITE_DOCLING_MODEL_REVISION", "main"),
    None,
)


def main() -> None:
    output = Path(sys.argv[1])
    output.mkdir(parents=True, exist_ok=True)
    wanted = [LAYOUT, TABLEFORMER]
    if "--granite-docling" in sys.argv:
        wanted.append(GRANITE_DOCLING)

    api = HfApi()
    manifest = {}
    for repo_id, revision, patterns in wanted:
        folder = repo_id.replace("/", "--")
        assert folder in ALLOWED_MODEL_FOLDERS, folder
        info = api.model_info(repo_id, revision=revision)
        snapshot_download(
            repo_id=repo_id,
            revision=info.sha,
            local_dir=output / folder,
            allow_patterns=patterns,
        )
        manifest[repo_id] = {"requestedRevision": revision, "commit": info.sha}
        print(f"{repo_id} @ {info.sha}")

    unexpected = unexpected_models(output)
    if unexpected:
        raise SystemExit(f"Unreviewed model folders: {unexpected}")
    (output / "manifest.json").write_text(json.dumps(manifest, indent=2) + "\n")


if __name__ == "__main__":
    main()
