from functools import lru_cache
from pathlib import Path
from typing import Annotated, Literal

from pydantic import Field, SecretStr, field_validator
from pydantic_settings import BaseSettings, NoDecode, SettingsConfigDict

EngineName = Literal["auto", "docling", "tesseract", "granite_docling"]


class Settings(BaseSettings):
    # Empty variables count as unset: an empty webhook secret must not
    # switch the receiver on with a key anyone can guess.
    model_config = SettingsConfigDict(env_prefix="REDSKY_OCR_", extra="ignore", env_ignore_empty=True)

    database_url: SecretStr
    # First deploy only: a superuser URL used to create the login and database
    # named in database_url. Remove it once the service has started.
    admin_database_url: SecretStr | None = None

    # Twenty is the identity provider, the permission authority and the store
    # of original files. Use the private Railway hostname in production.
    twenty_url: str
    # Twenty's SERVER_URL, when it differs from twenty_url.
    twenty_public_url: str | None = None
    # The worker fetches files with this key (a role that can only read
    # attachments). Users' own tokens decide who may see what.
    twenty_api_key: SecretStr | None = None
    twenty_webhook_secret: SecretStr | None = None
    twenty_timeout_seconds: float = 15.0
    # Hosts a Twenty file URL may point at or redirect to (S3 presigned URLs
    # go to the bucket endpoint). The Twenty host itself is always allowed.
    file_download_hosts: Annotated[list[str], NoDecode] = Field(default_factory=list)
    auto_process_attachments: bool = True
    # How often to list recent attachments and queue any the webhook missed.
    # 0 turns the sweep off.
    reconcile_interval_seconds: int = 600

    cors_allowed_origins: Annotated[list[str], NoDecode] = Field(default_factory=list)
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

    @field_validator(
        "file_download_hosts", "cors_allowed_origins", "ocr_languages", mode="before"
    )
    @classmethod
    def split_comma_separated(cls, value: object) -> object:
        if isinstance(value, str):
            return [item.strip() for item in value.split(",") if item.strip()]
        return value

    @field_validator("twenty_api_key", "twenty_webhook_secret", "granite_docling_api_key")
    @classmethod
    def reject_blank_secrets(cls, value: SecretStr | None) -> SecretStr | None:
        if value is not None and not value.get_secret_value().strip():
            raise ValueError("must not be blank; leave it unset instead")
        return value

    @field_validator("twenty_url", "twenty_public_url")
    @classmethod
    def strip_trailing_slash(cls, value: str | None) -> str | None:
        return value.rstrip("/") if value else value


@lru_cache
def get_settings() -> Settings:
    return Settings()
