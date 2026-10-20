import json
import uuid

import httpx

from redsky_ocr import repository
from redsky_ocr.events import EventDelivery, sign
from redsky_ocr.sources import Link

URL = "http://redsky-api.test/internal/ocr-events"
SECRET = "events-secret-0123456789abcdefghijklmnop"


def make_events(pool, tenant_id, count=1):
    with pool.connection() as connection:
        for _ in range(count):
            document, _ = repository.create_document(
                connection,
                tenant_id=tenant_id,
                source_system="storage",
                source_id=f"documents/{uuid.uuid4()}.pdf",
                filename="memo.pdf",
                links=[Link("twenty", "company", "c-1")],
                uploaded_by="user-1",
                no_ai=False,
            )
            repository.add_event(connection, document, "document.completed", str(uuid.uuid4()))


def outbox(pool):
    with pool.connection() as connection:
        return connection.execute("select * from redsky_ocr.event_outbox order by created_at").fetchall()


def test_events_are_signed_and_delivered_once(pool, workspace_id):
    make_events(pool, workspace_id)
    received = []

    def receiver(request: httpx.Request) -> httpx.Response:
        # What the RedSky API does on receipt.
        expected = sign(SECRET, request.headers["x-redsky-timestamp"], request.content)
        assert request.headers["x-redsky-signature"] == expected
        received.append(json.loads(request.content))
        return httpx.Response(204)

    delivery = EventDelivery(URL, SECRET, transport=httpx.MockTransport(receiver))

    assert delivery.deliver_due(pool) == 1
    assert delivery.deliver_due(pool) == 0
    assert received[0]["type"] == "document.completed"
    assert received[0]["document"]["source"]["system"] == "storage"
    assert outbox(pool)[0]["delivered_at"] is not None


def test_failed_delivery_backs_off_and_stops_the_round(pool, workspace_id):
    make_events(pool, workspace_id, count=3)
    attempts = []

    def receiver(request: httpx.Request) -> httpx.Response:
        attempts.append(1)
        return httpx.Response(503)

    delivery = EventDelivery(URL, SECRET, transport=httpx.MockTransport(receiver))

    assert delivery.deliver_due(pool) == 0
    # A receiver that is down is tried once per round, not once per event.
    assert len(attempts) == 1
    failed = [event for event in outbox(pool) if event["attempts"] == 1][0]
    assert failed["last_error"] == "HTTP 503" and failed["delivered_at"] is None
    assert failed["next_attempt_at"] > failed["created_at"]


def test_events_are_abandoned_after_the_last_attempt(pool, workspace_id):
    make_events(pool, workspace_id)
    event = outbox(pool)[0]

    with pool.connection() as connection:
        repository.reschedule_event(connection, str(event["id"]), "HTTP 500", max_attempts=1)

    assert outbox(pool)[0]["abandoned_at"] is not None
    with pool.connection() as connection:
        assert repository.claim_due_event(connection) is None
