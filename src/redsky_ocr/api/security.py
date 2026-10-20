import hashlib
import hmac
import threading
import time
from collections import OrderedDict
from typing import Generic, TypeVar

from fastapi import HTTPException, Request, status

from redsky_ocr.twenty import (
    Principal,
    TwentyClient,
    TwentyError,
    TwentyForbidden,
    TwentyNotFound,
    TwentyUnauthenticated,
    TwentyUnavailable,
)

TValue = TypeVar("TValue")

MAX_CACHE_ENTRIES = 10_000
WEBHOOK_MAX_AGE_SECONDS = 300


class TtlCache(Generic[TValue]):
    def __init__(self, ttl_seconds: float, max_entries: int = MAX_CACHE_ENTRIES) -> None:
        self.ttl_seconds = ttl_seconds
        self.max_entries = max_entries
        self.entries: OrderedDict[str, tuple[float, TValue]] = OrderedDict()
        self.lock = threading.Lock()

    def get(self, key: str) -> TValue | None:
        with self.lock:
            entry = self.entries.get(key)
            if entry is None:
                return None
            expires_at, value = entry
            if expires_at < time.monotonic():
                del self.entries[key]
                return None
            return value

    def put(self, key: str, value: TValue) -> None:
        with self.lock:
            self.entries[key] = (time.monotonic() + self.ttl_seconds, value)
            self.entries.move_to_end(key)
            while len(self.entries) > self.max_entries:
                self.entries.popitem(last=False)


def token_key(token: str) -> str:
    return hashlib.sha256(token.encode()).hexdigest()


class Authenticator:
    def __init__(self, twenty: TwentyClient, cache_seconds: int) -> None:
        self.twenty = twenty
        # A revoked token keeps working here for at most cache_seconds.
        self.principals: TtlCache[Principal] = TtlCache(cache_seconds)
        self.attachment_access: TtlCache[bool] = TtlCache(min(cache_seconds, 30))

    def principal(self, request: Request) -> Principal:
        header = request.headers.get("authorization", "")
        scheme, _, token = header.partition(" ")
        if scheme.lower() != "bearer" or not token.strip():
            raise HTTPException(
                status.HTTP_401_UNAUTHORIZED,
                "A RedSky (Twenty) access token is required.",
                headers={"WWW-Authenticate": "Bearer"},
            )
        token = token.strip()
        key = token_key(token)
        cached = self.principals.get(key)
        if cached is not None:
            return cached
        try:
            principal = self.twenty.current_user(token)
        except TwentyUnauthenticated as error:
            raise HTTPException(
                status.HTTP_401_UNAUTHORIZED,
                "The access token was rejected.",
                headers={"WWW-Authenticate": "Bearer"},
            ) from error
        except TwentyUnavailable as error:
            raise HTTPException(
                status.HTTP_503_SERVICE_UNAVAILABLE, "RedSky could not verify the token right now."
            ) from error
        except TwentyError as error:
            raise HTTPException(
                status.HTTP_401_UNAUTHORIZED,
                "The access token was rejected.",
                headers={"WWW-Authenticate": "Bearer"},
            ) from error
        self.principals.put(key, principal)
        return principal

    def can_read_attachment(self, principal: Principal, attachment_id: str) -> bool:
        # Twenty decides, with the caller's own token, so OCR output follows
        # whatever role, object and record rules apply to the original file.
        key = f"{token_key(principal.token)}:{attachment_id}"
        cached = self.attachment_access.get(key)
        if cached is not None:
            return cached
        try:
            self.twenty.get_attachment(principal.token, attachment_id)
            allowed = True
        except (TwentyForbidden, TwentyNotFound):
            allowed = False
        except TwentyUnauthenticated as error:
            raise HTTPException(status.HTTP_401_UNAUTHORIZED, "The access token was rejected.") from error
        except TwentyError as error:
            # Fail closed.
            raise HTTPException(
                status.HTTP_503_SERVICE_UNAVAILABLE, "RedSky could not check access right now."
            ) from error
        self.attachment_access.put(key, allowed)
        return allowed


def verify_webhook_signature(
    secret: str, body: bytes, signature: str | None, timestamp: str | None
) -> None:
    if not signature or not timestamp or not timestamp.isdigit():
        raise HTTPException(status.HTTP_401_UNAUTHORIZED, "Missing webhook signature.")
    age = abs(time.time() * 1000 - int(timestamp)) / 1000
    if age > WEBHOOK_MAX_AGE_SECONDS:
        raise HTTPException(status.HTTP_401_UNAUTHORIZED, "Webhook timestamp is too old.")
    # Twenty signs `${timestamp}:${JSON.stringify(body)}`, and the body it
    # sends is that same serialization, so the raw bytes are what to sign.
    expected = hmac.new(
        secret.encode(), timestamp.encode() + b":" + body, hashlib.sha256
    ).hexdigest()
    if not hmac.compare_digest(expected, signature):
        raise HTTPException(status.HTTP_401_UNAUTHORIZED, "Invalid webhook signature.")
