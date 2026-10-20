import pytest
from pydantic import ValidationError

from redsky_ocr.config import Settings

REQUIRED = {"REDSKY_OCR_DATABASE_URL": "postgresql://x/y", "REDSKY_OCR_TWENTY_URL": "http://twenty:3000/"}


def test_empty_variables_count_as_unset(monkeypatch):
    for name, value in {
        **REQUIRED,
        "REDSKY_OCR_TWENTY_WEBHOOK_SECRET": "",
        "REDSKY_OCR_TWENTY_API_KEY": "",
        "REDSKY_OCR_DOCLING_ARTIFACTS_PATH": "",
    }.items():
        monkeypatch.setenv(name, value)

    settings = Settings()

    assert settings.twenty_webhook_secret is None
    assert settings.twenty_api_key is None
    assert settings.docling_artifacts_path is None
    assert settings.twenty_url == "http://twenty:3000"


def test_blank_secrets_are_refused(monkeypatch):
    for name, value in {**REQUIRED, "REDSKY_OCR_TWENTY_WEBHOOK_SECRET": "   "}.items():
        monkeypatch.setenv(name, value)

    with pytest.raises(ValidationError):
        Settings()


def test_lists_are_comma_separated(monkeypatch):
    for name, value in {**REQUIRED, "REDSKY_OCR_OCR_LANGUAGES": "eng, deu", "REDSKY_OCR_CORS_ALLOWED_ORIGINS": "https://a.example"}.items():
        monkeypatch.setenv(name, value)

    settings = Settings()

    assert settings.ocr_languages == ["eng", "deu"]
    assert settings.cors_allowed_origins == ["https://a.example"]
