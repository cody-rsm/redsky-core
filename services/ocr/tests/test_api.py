import hashlib
import hmac
import json
import time
import uuid

import pytest
from conftest import BUCKET, SERVICE_TOKEN, WEBHOOK_SECRET
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


def gateway(tenant_id, user_id="redsky-user-1", token=SERVICE_TOKEN):
    return {"Authorization": f"Bearer {token}", "X-RedSky-Tenant-Id": tenant_id, "X-RedSky-User-Id": user_id}


def auth(user):
    return {"Authorization": f"Bearer {user.token}"}


def process_all(settings, pool, twenty_client):
    worker = Worker(settings, pool, twenty_client)
    while worker.run_once():
        pass


def put_document(s3, samples, name, key=None):
    key = key or f"documents/{uuid.uuid4()}/{name}"
    s3.put_object(Bucket=BUCKET, Key=key, Body=samples[name].path.read_bytes())
    return key


def register_storage(client, tenant_id, key, filename, links=(), engine="auto"):
    return client.post(
        "/api/v1/documents",
        json={
            "source": {"system": "storage", "id": key},
            "filename": filename,
            "links": [{"system": system, "object": obj, "id": record} for system, obj, record in links],
            "engine": engine,
        },
        headers=gateway(tenant_id),
    )


def register_twenty(client, headers, attachment, engine="auto"):
    return client.post(
        "/api/v1/documents", json={"source": {"system": "twenty", "id": attachment.id}, "engine": engine}, headers=headers
    )


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


def outbox(pool):
    with pool.connection() as connection:
        return connection.execute(
            "select event_type, payload from redsky_ocr.event_outbox order by created_at"
        ).fetchall()


def test_health_and_readiness(client):
    assert client.get("/health").json() == {"status": "ok"}
    ready = client.get("/ready")
    assert ready.status_code == 200 and ready.json()["checks"]["sources"] == ["storage", "twenty"]


@pytest.mark.parametrize("header", [None, "Bearer ", "Basic abc", "Bearer not-a-real-token"])
def test_requests_without_a_valid_token_are_rejected(client, header):
    headers = {"Authorization": header} if header else {}

    assert client.get("/api/v1/documents", headers=headers).status_code == 401


def test_gateway_calls_must_name_tenant_and_user(client, workspace_id):
    headers = gateway(workspace_id)
    del headers["X-RedSky-User-Id"]

    assert client.get("/api/v1/documents", headers=headers).status_code == 400
    assert client.get("/api/v1/documents", headers={**gateway("bad tenant!"), }).status_code == 400


def test_service_tokens_can_be_rotated(settings, pool, twenty_client, workspace_id):
    second = "second-gateway-token-0123456789abcdefghij"
    rotated = settings.model_copy(update={"service_tokens": settings.service_tokens.__class__(f"{SERVICE_TOKEN},{second}")})
    with TestClient(create_app(rotated, pool=pool, twenty=twenty_client)) as client:
        assert client.get("/api/v1/documents", headers=gateway(workspace_id, token=SERVICE_TOKEN)).status_code == 200
        assert client.get("/api/v1/documents", headers=gateway(workspace_id, token=second)).status_code == 200


def test_twenty_tokens_are_refused_unless_enabled(settings, pool, twenty_client, admin):
    closed = settings.model_copy(update={"accept_twenty_tokens": False})
    with TestClient(create_app(closed, pool=pool, twenty=twenty_client)) as client:
        assert client.get("/api/v1/documents", headers=auth(admin)).status_code == 401


def test_twenty_api_keys_cannot_act_as_users(client, service_key):
    assert client.get("/api/v1/documents", headers=auth(service_key)).status_code == 401


def test_fails_closed_when_twenty_is_unreachable(client, admin, fake_twenty):
    fake_twenty.available = False

    assert client.get("/api/v1/documents", headers=auth(admin)).status_code == 503


def test_gateway_registers_stored_documents_once(client, s3, samples, workspace_id):
    key = put_document(s3, samples, "native.pdf")
    links = [("twenty", "company", "c-1"), ("redsky", "deal", "d-7")]

    first = register_storage(client, workspace_id, key, "memo.pdf", links)
    second = register_storage(client, workspace_id, key, "memo.pdf", links)

    assert first.status_code == 202 and first.json()["status"] == "queued"
    assert first.json()["source"] == {"system": "storage", "id": key}
    assert first.json()["uploadedBy"] == "redsky-user-1"
    assert {(link["system"], link["object"], link["id"]) for link in first.json()["links"]} == set(links)
    assert second.status_code == 200 and second.json()["id"] == first.json()["id"]


@pytest.mark.parametrize(
    ("key", "status"),
    [("documents/missing.pdf", 404), ("elsewhere/secret.pdf", 422), ("documents/../secret.pdf", 422)],
)
def test_storage_registration_checks_the_key(client, workspace_id, key, status):
    assert register_storage(client, workspace_id, key, "x.pdf").status_code == status


def test_storage_registration_needs_a_filename(client, s3, samples, workspace_id):
    key = put_document(s3, samples, "native.pdf")
    response = client.post(
        "/api/v1/documents", json={"source": {"system": "storage", "id": key}}, headers=gateway(workspace_id)
    )

    assert response.status_code == 422


def test_only_the_gateway_registers_stored_documents(client, admin, s3, samples):
    key = put_document(s3, samples, "native.pdf")
    response = client.post(
        "/api/v1/documents",
        json={"source": {"system": "storage", "id": key}, "filename": "memo.pdf"},
        headers=auth(admin),
    )

    assert response.status_code == 403


def test_registration_bodies_are_bounded(client, workspace_id):
    response = client.post(
        "/api/v1/documents",
        headers={**gateway(workspace_id), "Content-Type": "application/json", "Content-Length": str(10 * 1024 * 1024)},
        content=b"{}",
    )

    assert response.status_code == 413


def test_stored_document_end_to_end(client, s3, samples, workspace_id, settings, pool, twenty_client):
    key = put_document(s3, samples, "board-update.docx")
    document_id = register_storage(client, workspace_id, key, "board.docx").json()["id"]
    headers = gateway(workspace_id)
    assert client.get(f"/api/v1/documents/{document_id}/content", headers=headers).status_code == 409

    process_all(settings, pool, twenty_client)

    document = client.get(f"/api/v1/documents/{document_id}", headers=headers).json()
    assert document["status"] == "completed" and document["contentAvailable"]
    assert document["sha256"] == hashlib.sha256(samples["board-update.docx"].path.read_bytes()).hexdigest()
    assert document["currentExtraction"]["engine"] == "docling"
    content = client.get(f"/api/v1/documents/{document_id}/content", headers=headers).json()
    assert content["pages"][0]["method"] == "native"
    markdown = client.get(
        f"/api/v1/documents/{document_id}/content", params={"format": "markdown", "download": True}, headers=headers
    )
    assert markdown.headers["content-type"].startswith("text/markdown")
    assert markdown.headers["content-disposition"] == 'attachment; filename="board.md"'
    tables = client.get(f"/api/v1/documents/{document_id}/tables", headers=headers).json()["tables"]
    assert tables[0]["cells"][1] == ["Revenue", "3,750", "4,200"]
    assert client.get(f"/api/v1/documents/{document_id}/chunks", headers=headers).json()["chunks"]


def test_twenty_users_register_attachments_they_can_read(client, admin, fake_twenty, workspace_id, samples):
    attachment = fake_twenty.add_attachment(workspace_id, "memo.pdf", samples["native.pdf"].path.read_bytes())
    colleague = fake_twenty.add_user(workspace_id, readable={"company", "person"})

    first = register_twenty(client, auth(admin), attachment)
    second = register_twenty(client, auth(admin), attachment)

    assert first.status_code == 202 and second.json()["id"] == first.json()["id"]
    assert first.json()["links"] == [{"system": "twenty", "object": "company", "id": attachment.target_id}]
    assert register_twenty(client, auth(colleague), attachment).status_code == 404


def test_gateway_registers_twenty_attachments_with_the_service_key(client, fake_twenty, workspace_id, samples):
    attachment = fake_twenty.add_attachment(workspace_id, "memo.pdf", samples["native.pdf"].path.read_bytes())

    response = register_twenty(client, gateway(workspace_id), attachment)

    assert response.status_code == 202 and response.json()["source"] == {"system": "twenty", "id": attachment.id}


def test_other_tenants_cannot_see_documents(client, s3, samples, workspace_id):
    key = put_document(s3, samples, "native.pdf")
    document_id = register_storage(client, workspace_id, key, "memo.pdf").json()["id"]
    other = gateway("another-tenant")

    assert client.get(f"/api/v1/documents/{document_id}", headers=other).status_code == 404
    assert client.get("/api/v1/documents", headers=other).json()["documents"] == []
    assert client.delete(f"/api/v1/documents/{document_id}", headers=other).status_code == 404


def test_twenty_users_cannot_see_stored_documents(client, admin, s3, samples, workspace_id):
    key = put_document(s3, samples, "native.pdf")
    document_id = register_storage(client, workspace_id, key, "memo.pdf").json()["id"]

    # Same tenant, but Twenty cannot vouch for a file it does not hold.
    assert client.get(f"/api/v1/documents/{document_id}", headers=auth(admin)).status_code == 404
    assert client.get("/api/v1/documents", headers=auth(admin)).json()["documents"] == []


@pytest.mark.parametrize(
    "readable",
    [{"company", "person"}, {"attachment", "person"}],
    ids=["no attachment access", "no access to the parent record"],
)
def test_twenty_access_follows_the_original_file(client, admin, fake_twenty, workspace_id, samples, settings, pool, twenty_client, readable):
    attachment = fake_twenty.add_attachment(workspace_id, "letter.png", samples["letter.png"].path.read_bytes())
    document_id = register_twenty(client, auth(admin), attachment).json()["id"]
    process_all(settings, pool, twenty_client)
    colleague = fake_twenty.add_user(workspace_id, readable=readable)

    for path in ("", "/content", "/tables", "/chunks"):
        assert client.get(f"/api/v1/documents/{document_id}{path}", headers=auth(colleague)).status_code == 404
    assert client.post(f"/api/v1/documents/{document_id}/reprocess", json={}, headers=auth(colleague)).status_code == 404
    assert client.get("/api/v1/documents", headers=auth(colleague)).json()["documents"] == []
    assert client.get("/api/v1/search", params={"q": "revenue"}, headers=auth(colleague)).json()["results"] == []
    assert client.get("/api/v1/search", params={"q": "revenue"}, headers=auth(admin)).json()["results"]


def test_gateway_search_covers_the_tenant(client, s3, samples, workspace_id, settings, pool, twenty_client):
    key = put_document(s3, samples, "letter.png")
    register_storage(client, workspace_id, key, "letter.png")
    process_all(settings, pool, twenty_client)

    hits = client.get("/api/v1/search", params={"q": "revenue quarter"}, headers=gateway(workspace_id)).json()["results"]
    elsewhere = client.get("/api/v1/search", params={"q": "revenue"}, headers=gateway("another-tenant")).json()["results"]

    assert hits[0]["source"] == {"system": "storage", "id": key} and hits[0]["pageNumber"] == 1
    assert elsewhere == []


def test_list_filters_by_linked_record(client, s3, samples, workspace_id):
    first = register_storage(client, workspace_id, put_document(s3, samples, "native.pdf"), "a.pdf", [("twenty", "company", "c-1")])
    register_storage(client, workspace_id, put_document(s3, samples, "native.pdf"), "b.pdf", [("twenty", "company", "c-2")])

    listed = client.get(
        "/api/v1/documents",
        params={"linkSystem": "twenty", "linkObject": "company", "linkId": "c-1"},
        headers=gateway(workspace_id),
    ).json()["documents"]

    assert [document["id"] for document in listed] == [first.json()["id"]]


def test_reprocess_rules(client, s3, samples, workspace_id, settings, pool, twenty_client):
    document_id = register_storage(client, workspace_id, put_document(s3, samples, "letter.png"), "letter.png").json()["id"]
    process_all(settings, pool, twenty_client)
    url = f"/api/v1/documents/{document_id}/reprocess"
    headers = gateway(workspace_id)

    queued = client.post(url, json={"engine": "tesseract"}, headers=headers)
    duplicate = client.post(url, json={"engine": "tesseract"}, headers=headers)
    conflicting = client.post(url, json={"engine": "auto"}, headers=headers)
    disabled = client.post(url, json={"engine": "granite_docling"}, headers=headers)

    assert queued.status_code == 202 and duplicate.status_code == 200
    assert conflicting.status_code == 409 and conflicting.json()["detail"]["code"] == "EXTRACTION_IN_PROGRESS"
    assert disabled.status_code == 422 and disabled.json()["detail"]["code"] == errors.ENGINE_UNAVAILABLE
    # The earlier result stays readable while the new run is queued.
    assert client.get(f"/api/v1/documents/{document_id}/content", headers=headers).status_code == 200


def test_no_ai_files_are_recorded_but_never_processed(client, s3, samples, workspace_id):
    key = put_document(s3, samples, "native.pdf")

    document = register_storage(client, workspace_id, key, "terms_NOAI.pdf").json()

    assert document["noAi"] and document["status"] == "uploaded" and document["latestExtraction"] is None
    reprocess = client.post(f"/api/v1/documents/{document['id']}/reprocess", json={}, headers=gateway(workspace_id))
    assert reprocess.status_code == 409


def test_gateway_deletes_derived_data(client, s3, samples, workspace_id, admin, settings, pool, twenty_client):
    document_id = register_storage(client, workspace_id, put_document(s3, samples, "letter.png"), "letter.png").json()["id"]
    process_all(settings, pool, twenty_client)

    assert client.delete(f"/api/v1/documents/{document_id}", headers=auth(admin)).status_code == 403
    assert client.delete(f"/api/v1/documents/{document_id}", headers=gateway(workspace_id)).status_code == 204
    assert client.get(f"/api/v1/documents/{document_id}", headers=gateway(workspace_id)).status_code == 404
    with pool.connection() as connection:
        assert connection.execute("select count(*) as n from redsky_ocr.page").fetchone()["n"] == 0


def test_finished_documents_produce_events(s3, samples, workspace_id, settings, pool, twenty_client):
    events_on = settings.model_copy(update={"events_url": "http://redsky-api.test/internal/ocr-events", "events_secret": settings.service_tokens})
    with TestClient(create_app(events_on, pool=pool, twenty=twenty_client)) as client:
        good = register_storage(client, workspace_id, put_document(s3, samples, "letter.png"), "letter.png").json()
        bad = register_storage(client, workspace_id, put_document(s3, samples, "corrupt.pdf"), "corrupt.pdf").json()
        worker = Worker(events_on, pool, twenty_client)
        worker.events = None  # delivery is tested separately
        while worker.run_once():
            pass

    events = {row["payload"]["document"]["id"]: row for row in outbox(pool)}
    assert events[good["id"]]["event_type"] == "document.completed"
    assert events[bad["id"]]["event_type"] == "document.failed"
    assert events[bad["id"]]["payload"]["document"]["statusReason"] == errors.CORRUPT_FILE
    assert events[good["id"]]["payload"]["tenantId"] == workspace_id
    assert "text" not in json.dumps(events[good["id"]]["payload"])


def test_webhook_queues_new_attachments_once(client, workspace_id):
    attachment_id = str(uuid.uuid4())
    body, headers = signed(attachment_event("attachment.created", workspace_id, attachment_id))

    first = client.post("/api/v1/webhooks/twenty", content=body, headers=headers)
    second = client.post("/api/v1/webhooks/twenty", content=body, headers=headers)

    assert first.json() == {"outcome": "queued"} and second.json() == {"outcome": "duplicate"}
    document = client.get("/api/v1/documents", params={"sourceId": attachment_id}, headers=gateway(workspace_id)).json()["documents"][0]
    assert document["uploadedBy"].startswith("twenty:") and document["links"][0]["system"] == "twenty"


def test_webhook_records_no_ai_files_without_queueing(client, workspace_id):
    body, headers = signed(attachment_event("attachment.created", workspace_id, str(uuid.uuid4()), "x_NOAI.pdf"))

    assert client.post("/api/v1/webhooks/twenty", content=body, headers=headers).json() == {"outcome": "recorded_no_ai"}


def test_webhook_delete_purges_extracted_text(client, admin, fake_twenty, workspace_id, samples, settings, pool, twenty_client):
    attachment = fake_twenty.add_attachment(workspace_id, "letter.png", samples["letter.png"].path.read_bytes())
    document_id = register_twenty(client, auth(admin), attachment).json()["id"]
    process_all(settings, pool, twenty_client)
    body, headers = signed(attachment_event("attachment.deleted", workspace_id, attachment.id))

    assert client.post("/api/v1/webhooks/twenty", content=body, headers=headers).json() == {"outcome": "purged"}
    assert client.get(f"/api/v1/documents/{document_id}", headers=auth(admin)).status_code == 404
    with pool.connection() as connection:
        assert connection.execute("select count(*) as n from redsky_ocr.page").fetchone()["n"] == 0


@pytest.mark.parametrize("tamper", ["signature", "timestamp", "body", "missing"])
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


def test_responses_are_not_cached_or_sniffed(client, workspace_id):
    response = client.get("/api/v1/documents", headers=gateway(workspace_id))

    assert response.headers["cache-control"] == "no-store"
    assert response.headers["x-content-type-options"] == "nosniff"


def test_engines_endpoint_reports_availability(client, workspace_id):
    engines = {engine["name"]: engine for engine in client.get("/api/v1/engines", headers=gateway(workspace_id)).json()["engines"]}

    assert engines["tesseract"]["available"]
    assert set(engines["docling"]["formats"]) >= {"docx", "pptx", "xlsx"}
    assert not engines["granite_docling"]["available"]
