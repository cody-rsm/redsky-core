import hashlib
import hmac
import json
import logging
import time

import httpx
from psycopg_pool import ConnectionPool

from redsky_ocr import repository

logger = logging.getLogger(__name__)

# Roughly two days of retries with the backoff in reschedule_event.
MAX_DELIVERY_ATTEMPTS = 60
EVENTS_PER_ROUND = 20


def sign(secret: str, timestamp: str, body: bytes) -> str:
    # The receiver recomputes this over the raw body it was sent.
    return hmac.new(secret.encode(), timestamp.encode() + b"." + body, hashlib.sha256).hexdigest()


class EventDelivery:
    def __init__(self, url: str, secret: str, transport: httpx.BaseTransport | None = None) -> None:
        self.url = url
        self.secret = secret
        self.client = httpx.Client(timeout=10, transport=transport, follow_redirects=False)

    def deliver_due(self, pool: ConnectionPool) -> int:
        delivered = 0
        for _ in range(EVENTS_PER_ROUND):
            with pool.connection() as connection:
                event = repository.claim_due_event(connection)
                if event is None:
                    break
                error = self._post(event)
                if error is None:
                    repository.mark_event_delivered(connection, str(event["id"]))
                    delivered += 1
                else:
                    repository.reschedule_event(connection, str(event["id"]), error, MAX_DELIVERY_ATTEMPTS)
                    logger.warning(
                        "event delivery failed",
                        extra={"event": str(event["id"]), "attempt": event["attempts"] + 1, "error": error},
                    )
                    break
        return delivered

    def _post(self, event: dict) -> str | None:
        body = json.dumps(event["payload"], separators=(",", ":")).encode()
        timestamp = str(int(time.time() * 1000))
        try:
            response = self.client.post(
                self.url,
                content=body,
                headers={
                    "Content-Type": "application/json",
                    "X-RedSky-Event-Id": str(event["id"]),
                    "X-RedSky-Event-Type": event["event_type"],
                    "X-RedSky-Timestamp": timestamp,
                    "X-RedSky-Signature": sign(self.secret, timestamp, body),
                },
            )
        except httpx.HTTPError as error:
            return type(error).__name__
        if 200 <= response.status_code < 300:
            return None
        return f"HTTP {response.status_code}"
