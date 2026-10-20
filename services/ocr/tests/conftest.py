import os
import sys
import uuid
from pathlib import Path

import boto3
import psycopg
import pytest
from moto import mock_aws
from psycopg.rows import dict_row
from psycopg_pool import ConnectionPool

sys.path.insert(0, str(Path(__file__).parent))

from fake_twenty import BASE_URL, PUBLIC_URL, FakeTwenty  # noqa: E402
from sample_documents import generate  # noqa: E402

from redsky_ocr.config import Settings  # noqa: E402
from redsky_ocr.db import migrate  # noqa: E402
from redsky_ocr.engines.base import EngineOptions  # noqa: E402
from redsky_ocr.runtime import engine_options  # noqa: E402
from redsky_ocr.twenty import TwentyClient  # noqa: E402

TEST_DATABASE_URL = os.environ.get("REDSKY_OCR_TEST_DATABASE_URL")
WEBHOOK_SECRET = "test-webhook-secret"
SERVICE_TOKEN = "gateway-token-0123456789abcdefghijklmnop"
BUCKET = "redsky-documents"


@pytest.fixture(scope="session")
def samples(tmp_path_factory):
    return generate(tmp_path_factory.mktemp("samples"))


@pytest.fixture
def options(tmp_path) -> EngineOptions:
    return EngineOptions(
        ocr_languages=["eng"],
        ocr_dpi=300,
        max_pages=50,
        max_image_pixels=60_000_000,
        work_dir=tmp_path,
        docling_artifacts_path=(
            Path(os.environ["REDSKY_OCR_DOCLING_ARTIFACTS_PATH"])
            if os.environ.get("REDSKY_OCR_DOCLING_ARTIFACTS_PATH")
            else None
        ),
        docling_table_structure=True,
        granite_docling_mode="off",
        granite_docling_api_url=None,
        granite_docling_api_key=None,
        timeout_seconds=120,
    )


@pytest.fixture(scope="session")
def database_url() -> str:
    if not TEST_DATABASE_URL:
        pytest.skip("REDSKY_OCR_TEST_DATABASE_URL is not set; database tests need a disposable Postgres")
    # Start every test session from an empty schema.
    with psycopg.connect(TEST_DATABASE_URL, autocommit=True) as connection:
        connection.execute("drop schema if exists redsky_ocr cascade")
    migrate(TEST_DATABASE_URL)
    return TEST_DATABASE_URL


@pytest.fixture
def pool(database_url):
    with psycopg.connect(database_url, autocommit=True) as connection:
        connection.execute(
            "truncate redsky_ocr.document, redsky_ocr.extraction, redsky_ocr.page,"
            " redsky_ocr.extracted_table, redsky_ocr.chunk, redsky_ocr.extraction_artifact,"
            " redsky_ocr.sync_state, redsky_ocr.document_link, redsky_ocr.event_outbox cascade"
        )
    pool = ConnectionPool(
        database_url, min_size=1, max_size=6, kwargs={"row_factory": dict_row, "autocommit": False}, open=True
    )
    yield pool
    pool.close()


@pytest.fixture
def fake_twenty() -> FakeTwenty:
    return FakeTwenty()


@pytest.fixture
def workspace_id() -> str:
    return str(uuid.uuid4())


@pytest.fixture
def service_key(fake_twenty, workspace_id):
    return fake_twenty.add_user(workspace_id, is_api_key=True)


@pytest.fixture
def s3():
    with mock_aws():
        client = boto3.client("s3", region_name="us-east-1")
        client.create_bucket(Bucket=BUCKET)
        yield client


@pytest.fixture
def settings(database_url, tmp_path, service_key, s3) -> Settings:
    return Settings(
        database_url=database_url,
        service_tokens=SERVICE_TOKEN,
        storage_bucket=BUCKET,
        storage_region="us-east-1",
        storage_access_key_id="testing",
        storage_secret_access_key="testing",
        twenty_url=BASE_URL,
        twenty_public_url=PUBLIC_URL,
        twenty_api_key=service_key.token,
        twenty_webhook_secret=WEBHOOK_SECRET,
        accept_twenty_tokens=True,
        work_dir=tmp_path / "work",
        worker_enabled=False,
        job_timeout_seconds=120,
        auth_cache_seconds=0,
    )


@pytest.fixture
def twenty_client(fake_twenty) -> TwentyClient:
    client = TwentyClient(BASE_URL, 5, transport=fake_twenty.transport(), public_url=PUBLIC_URL)
    yield client
    client.close()


@pytest.fixture
def engine_options_for(settings):
    return engine_options(settings)
