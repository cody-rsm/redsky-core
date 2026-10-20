from functools import lru_cache
from pathlib import Path
from typing import Annotated, Literal

from pydantic import Field, SecretStr, field_validator, model_validator
from pydantic_settings import BaseSettings, NoDecode, SettingsConfigDict

EngineName = Literal["auto", "docling", "tesseract", "granite_docling"]

MIN_SERVICE_TOKEN_LENGTH = 32


class Settings(BaseSettings):
    # Empty variables count as unset: an empty webhook secret must not
    # switch the receiver on with a key anyone can guess.
    model_config = SettingsConfigDict(env_prefix="REDSKY_OCR_", extra="ignore", env_ignore_empty=True)

    database_url: SecretStr
    # First deploy only: a superuser URL used to create the login and database
    # named in database_url. Remove it once the service has started.
    admin_database_url: SecretStr | None = None

    # The RedSky API calls with one of these bearer tokens (comma-separated,
    # so a new one can be added before the old one is removed). It has already
    # decided that the user it names may do what it asks.
    service_tokens: SecretStr | None = None

    # Where the RedSky API keeps original documents. This service only reads.
    storage_bucket: str | None = None
    storage_endpoint: str | None = None
    storage_region: str = "auto"
    storage_access_key_id: SecretStr | None = None
    storage_secret_access_key: SecretStr | None = None
    storage_addressing_style: Literal["virtual", "path"] = "virtual"
    # Keys outside this prefix are refused, so the service cannot be pointed
    # at anything else in the bucket.
    storage_key_prefix: str = "documents/"

    # Signed "document finished" events go here (the RedSky API).
    events_url: str | None = None
    events_secret: SecretStr | None = None

    # Twenty, while it owns CRM records: a source of attachments and,
    # optionally, an identity provider for callers holding Twenty tokens.
    twenty_url: str | None = None
    # Twenty's SERVER_URL, when it differs from twenty_url.
    twenty_public_url: str | None = None
    # The worker fetches attachments with this key (a role that can only read
    # attachments and their parent records).
    twenty_api_key: SecretStr | None = None
    twenty_webhook_secret: SecretStr | None = None
    twenty_timeout_seconds: float = 15.0
    # Accept Twenty access tokens from callers other than the RedSky API.
    # Off in the target layout, where everything comes through the API.
    accept_twenty_tokens: bool = False
    # Tenant recorded for Twenty attachments. Defaults to the Twenty workspace
    # id; the RedSky API must send the same value as X-RedSky-Tenant-Id.
    twenty_tenant_id: str | None = None
    # Hosts a Twenty file URL may point at or redirect to (S3 presigned URLs
    # go to the bucket endpoint). The Twenty host itself is always allowed.
    file_download_hosts: Annotated[list[str], NoDecode] = Field(default_factory=list)
    auto_process_attachments: bool = True
    # How often to list recent attachments and queue any the webhook missed.
    # 0 turns the sweep off.
    reconcile_interval_seconds: int = 600

    auth_cache_seconds: int = 60

    max_file_bytes: int = 50 * 1024 * 1024
    max_pages: int = 500
    max_image_pixels: int = 60_000_000
    max_zip_entries: int = 5_000
    max_zip_uncompressed_bytes: int = 300 * 1024 * 1024
    max_zip_compression_ratio: int = 150

    worker_enabled: bool = True
    worker_concurrency: int = 1
    worker_poll_seconds: float = 2.0
    job_timeout_seconds: int = 900
    job_max_attempts: int = 3
    # 0 leaves memory to the container limit; torch reserves a lot of address
    # space, so an address-space cap breaks the Docling engine.
    job_memory_limit_mb: int = 0
    work_dir: Path = Path("/tmp/redsky-ocr")

    default_engine: EngineName = "auto"
    ocr_languages: Annotated[list[str], NoDecode] = Field(default_factory=lambda: ["eng"])
    ocr_dpi: int = 300
    ocr_min_confidence: float = 60.0
    docling_artifacts_path: Path | None = None
    docling_table_structure: bool = True
    # off: never used. local: run in this service (slow on CPU). remote: an
    # OpenAI-compatible endpoint serving ibm-granite/granite-docling-258M on
    # RSM-controlled hardware.
    granite_docling_mode: Literal["off", "local", "remote"] = "off"
    granite_docling_api_url: str | None = None
    granite_docling_api_key: SecretStr | None = None

    clamav_host: str | None = None
    clamav_port: int = 3310

    log_level: str = "INFO"

    @field_validator("file_download_hosts", "ocr_languages", mode="before")
    @classmethod
    def split_comma_separated(cls, value: object) -> object:
        if isinstance(value, str):
            return [item.strip() for item in value.split(",") if item.strip()]
        return value

    @field_validator(
        "service_tokens",
        "events_secret",
        "storage_access_key_id",
        "storage_secret_access_key",
        "twenty_api_key",
        "twenty_webhook_secret",
        "granite_docling_api_key",
    )
    @classmethod
    def reject_blank_secrets(cls, value: SecretStr | None) -> SecretStr | None:
        if value is not None and not value.get_secret_value().strip():
            raise ValueError("must not be blank; leave it unset instead")
        return value

    @field_validator("service_tokens")
    @classmethod
    def require_long_tokens(cls, value: SecretStr | None) -> SecretStr | None:
        if value is not None and any(
            len(token) < MIN_SERVICE_TOKEN_LENGTH for token in _split(value.get_secret_value())
        ):
            raise ValueError(f"each service token needs at least {MIN_SERVICE_TOKEN_LENGTH} characters")
        return value

    @field_validator("twenty_url", "twenty_public_url", "events_url", "storage_endpoint")
    @classmethod
    def strip_trailing_slash(cls, value: str | None) -> str | None:
        return value.rstrip("/") if value else value

    @model_validator(mode="after")
    def check_dependent_settings(self) -> "Settings":
        if self.events_url and self.events_secret is None:
            raise ValueError("REDSKY_OCR_EVENTS_URL needs REDSKY_OCR_EVENTS_SECRET")
        twenty_features = (
            self.twenty_api_key or self.twenty_webhook_secret or self.accept_twenty_tokens
        )
        if twenty_features and not self.twenty_url:
            raise ValueError("Twenty settings need REDSKY_OCR_TWENTY_URL")
        if self.storage_bucket and (
            self.storage_access_key_id is None or self.storage_secret_access_key is None
        ):
            raise ValueError("REDSKY_OCR_STORAGE_BUCKET needs storage credentials")
        if not self.storage_key_prefix or self.storage_key_prefix.startswith("/"):
            raise ValueError("REDSKY_OCR_STORAGE_KEY_PREFIX must be a relative prefix such as documents/")
        return self

    def service_token_list(self) -> list[str]:
        return _split(self.service_tokens.get_secret_value()) if self.service_tokens else []

    def twenty_tenant(self, workspace_id: str) -> str:
        return self.twenty_tenant_id or workspace_id


def _split(value: str) -> list[str]:
    return [item.strip() for item in value.split(",") if item.strip()]


@lru_cache
def get_settings() -> Settings:
    return Settings()
