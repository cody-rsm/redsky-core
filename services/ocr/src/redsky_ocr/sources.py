import re
from dataclasses import dataclass, field
from typing import Any, Protocol

from redsky_ocr import errors
from redsky_ocr.config import Settings
from redsky_ocr.errors import ProcessingError
from redsky_ocr.twenty import (
    FileTooLarge,
    TwentyClient,
    TwentyNotFound,
    TwentyUnavailable,
)

STORAGE = "storage"
TWENTY = "twenty"
STORAGE_KEY = re.compile(r"^[A-Za-z0-9!_.*'()/-]{1,1024}$")


@dataclass(frozen=True)
class Link:
    system: str
    object: str
    record_id: str


@dataclass
class FetchedFile:
    data: bytes
    # None keeps what the document already records.
    filename: str | None = None
    links: list[Link] | None = None
    metadata: dict[str, Any] = field(default_factory=dict)


class DocumentSource(Protocol):
    system: str

    def fetch(self, document: dict[str, Any], max_bytes: int) -> FetchedFile: ...


class StorageSource:
    system = STORAGE

    def __init__(self, settings: Settings, client: Any | None = None) -> None:
        self.bucket = settings.storage_bucket
        self.prefix = settings.storage_key_prefix
        self.settings = settings
        self._client = client

    @property
    def client(self) -> Any:
        if self._client is None:
            import boto3
            from botocore.config import Config

            self._client = boto3.client(
                "s3",
                endpoint_url=self.settings.storage_endpoint,
                region_name=self.settings.storage_region,
                aws_access_key_id=self.settings.storage_access_key_id.get_secret_value(),
                aws_secret_access_key=self.settings.storage_secret_access_key.get_secret_value(),
                config=Config(
                    s3={"addressing_style": self.settings.storage_addressing_style},
                    retries={"max_attempts": 3, "mode": "standard"},
                    connect_timeout=10,
                    read_timeout=60,
                ),
            )
        return self._client

    def validate_key(self, key: str) -> str:
        if (
            not STORAGE_KEY.match(key)
            or not key.startswith(self.prefix)
            or ".." in key.split("/")
            or "//" in key
        ):
            raise ProcessingError(
                errors.SOURCE_NOT_FOUND, f"Storage keys must sit under {self.prefix}."
            )
        return key

    def exists(self, key: str) -> bool:
        from botocore.exceptions import ClientError

        try:
            self.client.head_object(Bucket=self.bucket, Key=self.validate_key(key))
        except ClientError as error:
            if error.response.get("Error", {}).get("Code") in ("404", "NoSuchKey", "NotFound"):
                return False
            raise ProcessingError(
                errors.SOURCE_UNAVAILABLE, "The documents bucket could not be reached.", retryable=True
            ) from error
        return True

    def fetch(self, document: dict[str, Any], max_bytes: int) -> FetchedFile:
        from botocore.exceptions import BotoCoreError, ClientError

        key = self.validate_key(document["source_id"])
        try:
            response = self.client.get_object(Bucket=self.bucket, Key=key)
            if response.get("ContentLength", 0) > max_bytes:
                raise ProcessingError(errors.FILE_TOO_LARGE, _too_large(max_bytes))
            with response["Body"] as body:
                data = body.read(max_bytes + 1)
        except ClientError as error:
            if error.response.get("Error", {}).get("Code") in ("404", "NoSuchKey", "NotFound"):
                raise ProcessingError(
                    errors.SOURCE_DELETED, "The document no longer exists in storage."
                ) from error
            raise ProcessingError(
                errors.SOURCE_UNAVAILABLE, "The documents bucket could not be reached.", retryable=True
            ) from error
        except BotoCoreError as error:
            raise ProcessingError(
                errors.SOURCE_UNAVAILABLE, "The documents bucket could not be reached.", retryable=True
            ) from error
        if len(data) > max_bytes:
            raise ProcessingError(errors.FILE_TOO_LARGE, _too_large(max_bytes))
        return FetchedFile(data=data)


class TwentySource:
    system = TWENTY

    def __init__(self, twenty: TwentyClient, api_key: str) -> None:
        self.twenty = twenty
        self.api_key = api_key

    def fetch(self, document: dict[str, Any], max_bytes: int) -> FetchedFile:
        try:
            attachment = self.twenty.get_attachment(self.api_key, document["source_id"])
            if not attachment.url:
                raise TwentyNotFound("The attachment has no file.")
            data = self.twenty.download(attachment.url, max_bytes)
        except TwentyNotFound as error:
            raise ProcessingError(
                errors.SOURCE_DELETED, "The attachment or its file no longer exists in Twenty."
            ) from error
        except FileTooLarge as error:
            raise ProcessingError(errors.FILE_TOO_LARGE, _too_large(max_bytes)) from error
        except TwentyUnavailable as error:
            raise ProcessingError(
                errors.SOURCE_UNAVAILABLE, "Twenty could not be reached.", retryable=True
            ) from error
        return FetchedFile(
            data=data,
            filename=attachment.name,
            links=twenty_links(attachment),
            metadata={"fileId": attachment.file_id} if attachment.file_id else {},
        )


def twenty_links(attachment: Any) -> list[Link]:
    if not attachment.linked_object or not attachment.linked_record_id:
        return []
    return [Link(TWENTY, attachment.linked_object, attachment.linked_record_id)]


def build_sources(settings: Settings, twenty: TwentyClient | None) -> dict[str, DocumentSource]:
    sources: dict[str, DocumentSource] = {}
    if settings.storage_bucket:
        sources[STORAGE] = StorageSource(settings)
    if twenty is not None and settings.twenty_api_key is not None:
        sources[TWENTY] = TwentySource(twenty, settings.twenty_api_key.get_secret_value())
    return sources


def _too_large(max_bytes: int) -> str:
    return f"The file is larger than the {max_bytes // (1024 * 1024)} MB limit."
