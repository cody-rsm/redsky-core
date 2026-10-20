import hashlib
import hmac
import re
import threading
import time
from collections import OrderedDict
from dataclasses import dataclass
from typing import Any, Generic, TypeVar

from fastapi import HTTPException, Request, status

from redsky_ocr.config import Settings
from redsky_ocr.sources import TWENTY
from redsky_ocr.twenty import (
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


GATEWAY = "gateway"
TWENTY_USER = "twenty"
# Opaque identifiers chosen by the RedSky API; kept to a safe alphabet because
# they end up in logs and queries.
CALLER_ID = re.compile(r"^[A-Za-z0-9._:@-]{1,128}$")


@dataclass(frozen=True)
class Caller:
    kind: str
    tenant_id: str
    user_id: str
    twenty_token: str | None = None

    def __repr__(self) -> str:
        return f"Caller(kind={self.kind!r}, tenant_id={self.tenant_id!r}, user_id={self.user_id!r})"


class Authenticator:
    def __init__(self, settings: Settings, twenty: TwentyClient | None) -> None:
        self.settings = settings
        self.twenty = twenty
        self.service_tokens = [token.encode() for token in settings.service_token_list()]
        cache_seconds = settings.auth_cache_seconds
        # A revoked token keeps working here for at most cache_seconds.
        self.twenty_users: TtlCache[Caller] = TtlCache(cache_seconds)
        self.attachment_access: TtlCache[bool] = TtlCache(min(cache_seconds, 30))

    def caller(self, request: Request) -> Caller:
        header = request.headers.get("authorization", "")
        scheme, _, token = header.partition(" ")
        token = token.strip()
        if scheme.lower() != "bearer" or not token:
            raise _unauthorized("A bearer token is required.")
        if self._is_service_token(token):
            return self._gateway_caller(request)
        if self.settings.accept_twenty_tokens and self.twenty is not None:
            return self._twenty_caller(token)
        raise _unauthorized("The token was rejected.")

    def _is_service_token(self, token: str) -> bool:
        candidate = token.encode()
        # Compare against every token so timing does not reveal which matched.
        matches = [hmac.compare_digest(candidate, known) for known in self.service_tokens]
        return any(matches)

    def _gateway_caller(self, request: Request) -> Caller:
        tenant_id = request.headers.get("x-redsky-tenant-id", "")
        user_id = request.headers.get("x-redsky-user-id", "")
        if not CALLER_ID.match(tenant_id) or not CALLER_ID.match(user_id):
            raise HTTPException(
                status.HTTP_400_BAD_REQUEST,
                "Service calls must name the tenant and user (X-RedSky-Tenant-Id, X-RedSky-User-Id).",
            )
        return Caller(kind=GATEWAY, tenant_id=tenant_id, user_id=user_id)

    def _twenty_caller(self, token: str) -> Caller:
        key = token_key(token)
        cached = self.twenty_users.get(key)
        if cached is not None:
            return cached
        try:
            user = self.twenty.current_user(token)
        except TwentyUnavailable as error:
            raise HTTPException(
                status.HTTP_503_SERVICE_UNAVAILABLE, "RedSky could not verify the token right now."
            ) from error
        except TwentyError as error:
            raise _unauthorized("The token was rejected.") from error
        caller = Caller(
            kind=TWENTY_USER,
            tenant_id=self.settings.twenty_tenant(user.workspace_id),
            user_id=f"twenty:{user.workspace_member_id or user.user_id}",
            twenty_token=token,
        )
        self.twenty_users.put(key, caller)
        return caller

    def can_read(self, caller: Caller, document: dict[str, Any]) -> bool:
        # The RedSky API owns permissions and has checked before calling;
        # queries are already limited to the caller's tenant.
        if caller.kind == GATEWAY:
            return True
        # Twenty can vouch only for files it holds.
        if document["source_system"] != TWENTY:
            return False
        return self.can_read_attachment(caller, document["source_id"])

    def can_read_attachment(self, caller: Caller, attachment_id: str) -> bool:
        # Twenty decides, with the caller's own token, so OCR output follows
        # whatever role, object and record rules apply to the original file.
        key = f"{token_key(caller.twenty_token)}:{attachment_id}"
        cached = self.attachment_access.get(key)
        if cached is not None:
            return cached
        try:
            self.twenty.get_attachment(caller.twenty_token, attachment_id)
            allowed = True
        except (TwentyForbidden, TwentyNotFound):
            allowed = False
        except TwentyUnauthenticated as error:
            raise _unauthorized("The token was rejected.") from error
        except TwentyError as error:
            # Fail closed.
            raise HTTPException(
                status.HTTP_503_SERVICE_UNAVAILABLE, "RedSky could not check access right now."
            ) from error
        self.attachment_access.put(key, allowed)
        return allowed


def _unauthorized(message: str) -> HTTPException:
    return HTTPException(status.HTTP_401_UNAUTHORIZED, message, headers={"WWW-Authenticate": "Bearer"})


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
