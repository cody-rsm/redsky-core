import pytest
from pydantic import ValidationError

from redsky_ocr.config import Settings

REQUIRED = {"REDSKY_OCR_DATABASE_URL": "postgresql://x/y", "REDSKY_OCR_TWENTY_URL": "http://twenty:3000/"}
TOKEN = "a" * 40


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
    for name, value in {
        **REQUIRED,
        "REDSKY_OCR_OCR_LANGUAGES": "eng, deu",
        "REDSKY_OCR_SERVICE_TOKENS": f"{TOKEN}, {'b' * 40}",
    }.items():
        monkeypatch.setenv(name, value)

    settings = Settings()

    assert settings.ocr_languages == ["eng", "deu"]
    assert settings.service_token_list() == [TOKEN, "b" * 40]


def test_twenty_is_optional(monkeypatch):
    monkeypatch.setenv("REDSKY_OCR_DATABASE_URL", "postgresql://x/y")

    settings = Settings()

    assert settings.twenty_url is None
    assert settings.twenty_tenant("workspace-1") == "workspace-1"


@pytest.mark.parametrize(
    "variables",
    [
        {"REDSKY_OCR_SERVICE_TOKENS": "too-short"},
        {"REDSKY_OCR_EVENTS_URL": "http://redsky-api.railway.internal/events"},
        {"REDSKY_OCR_STORAGE_BUCKET": "documents"},
        {"REDSKY_OCR_STORAGE_KEY_PREFIX": "/documents/"},
    ],
    ids=["short service token", "events without a secret", "bucket without credentials", "absolute prefix"],
)
def test_incomplete_or_unsafe_settings_are_refused(monkeypatch, variables):
    for name, value in {"REDSKY_OCR_DATABASE_URL": "postgresql://x/y", **variables}.items():
        monkeypatch.setenv(name, value)

    with pytest.raises(ValidationError):
        Settings()


def test_twenty_features_need_twenty(monkeypatch):
    monkeypatch.setenv("REDSKY_OCR_DATABASE_URL", "postgresql://x/y")
    monkeypatch.setenv("REDSKY_OCR_TWENTY_API_KEY", "key")

    with pytest.raises(ValidationError):
        Settings()
