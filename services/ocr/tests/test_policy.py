import pytest

from redsky_ocr import policy


def test_no_forbidden_ocr_or_model_packages_are_installed():
    assert policy.forbidden_installed() == []


def test_only_reviewed_model_folders_are_allowed(tmp_path):
    (tmp_path / "docling-project--docling-layout-heron").mkdir()
    (tmp_path / "PaddlePaddle--PP-OCRv5_server_det").mkdir()

    assert policy.unexpected_models(tmp_path) == ["PaddlePaddle--PP-OCRv5_server_det"]
    with pytest.raises(SystemExit, match="unreviewed model folders"):
        policy.enforce(tmp_path)


def test_reviewed_models_pass(tmp_path):
    for folder in policy.ALLOWED_MODEL_FOLDERS:
        (tmp_path / folder).mkdir()

    policy.enforce(tmp_path)
