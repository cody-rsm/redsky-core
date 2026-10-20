import hashlib
import hmac
import json
import time
import uuid

import pytest
from conftest import WEBHOOK_SECRET
from fastapi.testclient import TestClient

from redsky_ocr import errors
from redsky_ocr.api.app import create_app
from redsky_ocr.worker import Worker


@pytest.fixture
def client(settings, pool, twenty_client):
    with TestClient(create_app(settings, pool=pool, twenty=twenty_client)) as client:
        yield client


@pytest.fixture
def admin(fake_twenty, workspace_id):
    return fake_twenty.add_user(workspace_id)


def auth(user):
    return {"Authorization": f"Bearer {user.token}"}


def process_all(settings, pool, twenty_client):
    worker = Worker(settings, pool, twenty_client)
    while worker.run_once():
        pass


def register(client, user, attachment, engine="auto"):
    return client.post("/api/v1/documents", json={"attachmentId": attachment.id, "engine": engine}, headers=auth(user))


def signed(body: dict, timestamp: int | None = None, secret: str = WEBHOOK_SECRET):
    raw = json.dumps(body, separators=(",", ":")).encode()
    timestamp = str(timestamp or int(time.time() * 1000))
    signature = hmac.new(secret.encode(), timestamp.encode() + b":" + raw, hashlib.sha256).hexdigest()
    return raw, {
        "Content-Type": "application/json",
        "X-Twenty-Webhook-Signature": signature,
        "X-Twenty-Webhook-Timestamp": timestamp,
    }


def attachment_event(event_name, workspace_id, attachment_id, name="memo.pdf"):
    return {
        "eventName": event_name,
        "workspaceId": workspace_id,
        "userId": str(uuid.uuid4()),
        "workspaceMemberId": str(uuid.uuid4()),
        "objectMetadata": {"nameSingular": "attachment"},
        "record": {
            "id": attachment_id,
            "name": name,
            "targetCompanyId": str(uuid.uuid4()),
            "file": [{"fileId": str(uuid.uuid4()), "label": name, "extension": ".pdf"}],
        },
    }


def test_health_and_readiness(client):
    assert client.get("/health").json() == {"status": "ok"}
    ready = client.get("/ready")
    assert ready.status_code == 200 and ready.json()["checks"]["database"] == "ok"


@pytest.mark.parametrize("header", [None, "Bearer ", "Basic abc", "Bearer not-a-real-token"])
def test_requests_without_a_valid_token_are_rejected(client, header):
    headers = {"Authorization": header} if header else {}

    response = client.get("/api/v1/documents", headers=headers)

    assert response.status_code == 401


def test_api_keys_cannot_act_as_users(client, service_key):
    assert client.get("/api/v1/documents", headers=auth(service_key)).status_code == 401


def test_fails_closed_when_twenty_is_unreachable(client, admin, fake_twenty):
    fake_twenty.available = False

    assert client.get("/api/v1/documents", headers=auth(admin)).status_code == 503


def test_register_is_idempotent(client, admin, fake_twenty, workspace_id, samples):
    attachment = fake_twenty.add_attachment(workspace_id, "memo.pdf", samples["native.pdf"].path.read_bytes())

    first = register(client, admin, attachment)
    second = register(client, admin, attachment)

    assert first.status_code == 202 and first.json()["status"] == "queued"
    assert second.status_code == 200 and second.json()["id"] == first.json()["id"]


def test_end_to_end_content_tables_and_chunks(client, admin, fake_twenty, workspace_id, samples, settings, pool, twenty_client):
    attachment = fake_twenty.add_attachment(workspace_id, "board.docx", samples["board-update.docx"].path.read_bytes())
    document_id = register(client, admin, attachment).json()["id"]
    assert client.get(f"/api/v1/documents/{document_id}/content", headers=auth(admin)).status_code == 409

    process_all(settings, pool, twenty_client)

    document = client.get(f"/api/v1/documents/{document_id}", headers=auth(admin)).json()
    assert document["status"] == "completed" and document["contentAvailable"]
    assert document["currentExtraction"]["engine"] == "docling"
    content = client.get(f"/api/v1/documents/{document_id}/content", headers=auth(admin)).json()
    assert content["pages"][0]["method"] == "native"
    markdown = client.get(
        f"/api/v1/documents/{document_id}/content", params={"format": "markdown", "download": True}, headers=auth(admin)
    )
    assert markdown.headers["content-type"].startswith("text/markdown")
    assert markdown.headers["content-disposition"] == 'attachment; filename="board.md"'
    tables = client.get(f"/api/v1/documents/{document_id}/tables", headers=auth(admin)).json()["tables"]
    assert tables[0]["cells"][1] == ["Revenue", "3,750", "4,200"]
    chunks = client.get(f"/api/v1/documents/{document_id}/chunks", headers=auth(admin)).json()
    assert chunks["chunks"] and chunks["noAi"] is False


def test_other_workspaces_cannot_see_documents(client, admin, fake_twenty, workspace_id, samples):
    attachment = fake_twenty.add_attachment(workspace_id, "memo.pdf", samples["native.pdf"].path.read_bytes())
    document_id = register(client, admin, attachment).json()["id"]
    outsider = fake_twenty.add_user(str(uuid.uuid4()))

    assert client.get(f"/api/v1/documents/{document_id}", headers=auth(outsider)).status_code == 404
    assert client.get("/api/v1/documents", headers=auth(outsider)).json()["documents"] == []


@pytest.mark.parametrize(
    "readable",
    [{"company", "person"}, {"attachment", "person"}],
    ids=["no attachment access", "no access to the parent record"],
)
def test_access_follows_the_original_file_in_twenty(client, admin, fake_twenty, workspace_id, samples, settings, pool, twenty_client, readable):
    attachment = fake_twenty.add_attachment(workspace_id, "letter.png", samples["letter.png"].path.read_bytes())
    document_id = register(client, admin, attachment).json()["id"]
    process_all(settings, pool, twenty_client)
    colleague = fake_twenty.add_user(workspace_id, readable=readable)

    for path in ("", "/content", "/tables", "/chunks"):
        assert client.get(f"/api/v1/documents/{document_id}{path}", headers=auth(colleague)).status_code == 404
    assert client.post(f"/api/v1/documents/{document_id}/reprocess", json={}, headers=auth(colleague)).status_code == 404
    assert client.get("/api/v1/documents", headers=auth(colleague)).json()["documents"] == []
    assert client.get("/api/v1/search", params={"q": "revenue"}, headers=auth(colleague)).json()["results"] == []
    assert register(client, colleague, attachment).status_code == 404
    # The admin still sees it.
    assert client.get("/api/v1/search", params={"q": "revenue"}, headers=auth(admin)).json()["results"]


def test_upload_stores_the_file_in_twenty_first(client, admin, fake_twenty, samples):
    record_id = str(uuid.uuid4())

    response = client.post(
        "/api/v1/documents",
        headers=auth(admin),
        files={"file": ("letter.jpg", samples["letter.jpg"].path.read_bytes(), "image/jpeg")},
        data={"linkedObject": "company", "linkedRecordId": record_id},
    )

    assert response.status_code == 202
    stored = fake_twenty.attachments[response.json()["attachmentId"]]
    assert stored.target_field == "targetCompanyId" and stored.target_id == record_id
    assert response.json()["linkedRecord"] == {"object": "company", "id": record_id}


@pytest.mark.parametrize(
    ("name", "status", "code"),
    [("macro.docx", 422, errors.MACRO_ENABLED), ("bomb.docx", 422, errors.ARCHIVE_BOMB)],
)
def test_upload_rejects_dangerous_files_before_storing_them(client, admin, fake_twenty, samples, name, status, code):
    response = client.post(
        "/api/v1/documents",
        headers=auth(admin),
        files={"file": (name, samples[name].path.read_bytes())},
        data={"linkedObject": "company", "linkedRecordId": str(uuid.uuid4())},
    )

    assert response.status_code == status and response.json()["detail"]["code"] == code
    assert fake_twenty.attachments == {}


def test_upload_rejects_unsupported_types(client, admin):
    response = client.post(
        "/api/v1/documents",
        headers=auth(admin),
        files={"file": ("notes.txt", b"plain text notes")},
        data={"linkedObject": "company", "linkedRecordId": str(uuid.uuid4())},
    )

    assert response.status_code == 415


def test_upload_rejects_oversized_bodies_before_reading_them(client, admin, settings):
    response = client.post(
        "/api/v1/documents",
        headers={**auth(admin), "Content-Type": "multipart/form-data; boundary=x", "Content-Length": str(settings.max_file_bytes * 2)},
        content=b"--x--",
    )

    assert response.status_code == 413


def test_upload_needs_a_valid_linked_record(client, admin, samples):
    response = client.post(
        "/api/v1/documents",
        headers=auth(admin),
        files={"file": ("letter.png", samples["letter.png"].path.read_bytes())},
        data={"linkedObject": "company; drop table", "linkedRecordId": "x"},
    )

    assert response.status_code == 422


def test_reprocess_rules(client, admin, fake_twenty, workspace_id, samples, settings, pool, twenty_client):
    attachment = fake_twenty.add_attachment(workspace_id, "letter.png", samples["letter.png"].path.read_bytes())
    document_id = register(client, admin, attachment).json()["id"]
    process_all(settings, pool, twenty_client)
    url = f"/api/v1/documents/{document_id}/reprocess"

    queued = client.post(url, json={"engine": "tesseract"}, headers=auth(admin))
    duplicate = client.post(url, json={"engine": "tesseract"}, headers=auth(admin))
    conflicting = client.post(url, json={"engine": "auto"}, headers=auth(admin))
    disabled = client.post(url, json={"engine": "granite_docling"}, headers=auth(admin))

    assert queued.status_code == 202 and duplicate.status_code == 200
    assert conflicting.status_code == 409 and conflicting.json()["detail"]["code"] == "EXTRACTION_IN_PROGRESS"
    assert disabled.status_code == 422 and disabled.json()["detail"]["code"] == errors.ENGINE_UNAVAILABLE
    # The earlier result stays readable while the new run is queued.
    assert client.get(f"/api/v1/documents/{document_id}/content", headers=auth(admin)).status_code == 200


def test_no_ai_files_are_recorded_but_never_processed(client, admin, fake_twenty, workspace_id, samples):
    attachment = fake_twenty.add_attachment(workspace_id, "terms_NOAI.pdf", samples["native.pdf"].path.read_bytes())

    document = register(client, admin, attachment).json()

    assert document["noAi"] and document["status"] == "uploaded" and document["latestExtraction"] is None
    reprocess = client.post(f"/api/v1/documents/{document['id']}/reprocess", json={}, headers=auth(admin))
    assert reprocess.status_code == 409


def test_list_filters_by_linked_record(client, admin, fake_twenty, workspace_id, samples):
    record_id = str(uuid.uuid4())
    first = fake_twenty.add_attachment(workspace_id, "a.pdf", samples["native.pdf"].path.read_bytes(), target_id=record_id)
    second = fake_twenty.add_attachment(workspace_id, "b.pdf", samples["native.pdf"].path.read_bytes())
    register(client, admin, first)
    register(client, admin, second)

    listed = client.get("/api/v1/documents", params={"linkedRecordId": record_id}, headers=auth(admin)).json()

    assert [document["attachmentId"] for document in listed["documents"]] == [first.id]


def test_webhook_queues_new_attachments_once(client, workspace_id, pool):
    attachment_id = str(uuid.uuid4())
    body, headers = signed(attachment_event("attachment.created", workspace_id, attachment_id))

    first = client.post("/api/v1/webhooks/twenty", content=body, headers=headers)
    second = client.post("/api/v1/webhooks/twenty", content=body, headers=headers)

    assert first.json() == {"outcome": "queued"} and second.json() == {"outcome": "duplicate"}


def test_webhook_records_no_ai_files_without_queueing(client, workspace_id):
    body, headers = signed(attachment_event("attachment.created", workspace_id, str(uuid.uuid4()), "x_NOAI.pdf"))

    assert client.post("/api/v1/webhooks/twenty", content=body, headers=headers).json() == {"outcome": "recorded_no_ai"}


def test_webhook_delete_purges_extracted_text(client, admin, fake_twenty, workspace_id, samples, settings, pool, twenty_client):
    attachment = fake_twenty.add_attachment(workspace_id, "letter.png", samples["letter.png"].path.read_bytes())
    document_id = register(client, admin, attachment).json()["id"]
    process_all(settings, pool, twenty_client)
    body, headers = signed(attachment_event("attachment.deleted", workspace_id, attachment.id))

    assert client.post("/api/v1/webhooks/twenty", content=body, headers=headers).json() == {"outcome": "purged"}
    assert client.get(f"/api/v1/documents/{document_id}", headers=auth(admin)).status_code == 404
    with pool.connection() as connection:
        assert connection.execute("select count(*) as n from redsky_ocr.page").fetchone()["n"] == 0


@pytest.mark.parametrize(
    "tamper",
    ["signature", "timestamp", "body", "missing"],
)
def test_webhook_rejects_unsigned_or_tampered_requests(client, workspace_id, tamper):
    body, headers = signed(attachment_event("attachment.created", workspace_id, str(uuid.uuid4())))
    if tamper == "signature":
        headers["X-Twenty-Webhook-Signature"] = "0" * 64
    elif tamper == "timestamp":
        body, headers = signed(
            attachment_event("attachment.created", workspace_id, str(uuid.uuid4())),
            timestamp=int((time.time() - 3600) * 1000),
        )
    elif tamper == "body":
        body = body.replace(b"memo.pdf", b"evil.pdf")
    else:
        del headers["X-Twenty-Webhook-Signature"]

    assert client.post("/api/v1/webhooks/twenty", content=body, headers=headers).status_code == 401


def test_webhook_ignores_other_events(client, workspace_id):
    event = attachment_event("attachment.created", workspace_id, str(uuid.uuid4()))
    event["eventName"] = "company.created"
    body, headers = signed(event)

    assert client.post("/api/v1/webhooks/twenty", content=body, headers=headers).json() == {"outcome": "ignored"}


def test_responses_are_not_cached_or_sniffed(client, admin):
    response = client.get("/api/v1/documents", headers=auth(admin))

    assert response.headers["cache-control"] == "no-store"
    assert response.headers["x-content-type-options"] == "nosniff"


def test_engines_endpoint_reports_availability(client, admin):
    engines = {engine["name"]: engine for engine in client.get("/api/v1/engines", headers=auth(admin)).json()["engines"]}

    assert engines["tesseract"]["available"]
    assert set(engines["docling"]["formats"]) >= {"docx", "pptx", "xlsx"}
    assert not engines["granite_docling"]["available"]


def test_upload_racing_twentys_webhook_yields_one_document(client, admin, fake_twenty, workspace_id, samples):
    # Twenty can deliver attachment.created before the upload request returns.
    create = fake_twenty._create_attachment

    def create_and_notify(user, body):
        response = create(user, body)
        record = response.json()["data"]["createAttachment"]
        event = attachment_event("attachment.created", workspace_id, record["id"], record["name"])
        raw, headers = signed(event)
        assert client.post("/api/v1/webhooks/twenty", content=raw, headers=headers).json() == {"outcome": "queued"}
        return response

    fake_twenty._create_attachment = create_and_notify

    response = client.post(
        "/api/v1/documents",
        headers=auth(admin),
        files={"file": ("letter.png", samples["letter.png"].path.read_bytes())},
        data={"linkedObject": "company", "linkedRecordId": str(uuid.uuid4())},
    )

    assert response.status_code == 202
    listed = client.get("/api/v1/documents", headers=auth(admin)).json()["documents"]
    assert [document["id"] for document in listed] == [response.json()["id"]]


def test_webhook_bodies_are_bounded_before_they_are_read(client):
    too_big = client.post(
        "/api/v1/webhooks/twenty",
        headers={"Content-Type": "application/json", "Content-Length": str(50 * 1024 * 1024)},
        content=b"{}",
    )
    chunked = client.post(
        "/api/v1/webhooks/twenty",
        headers={"Content-Type": "application/json"},
        content=iter([b"{", b"}"]),
    )

    assert too_big.status_code == 413
    assert chunked.status_code == 411
