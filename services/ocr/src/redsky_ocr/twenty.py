import re
from dataclasses import dataclass
from datetime import UTC, datetime
from typing import Any
from urllib.parse import urljoin, urlsplit

import httpx

TARGET_FIELD = re.compile(r"^target([A-Z][A-Za-z0-9]*)Id$")
MAX_REDIRECTS = 3

CURRENT_USER_QUERY = """
query RedSkyOcrCurrentUser {
  currentUser { id currentWorkspace { id } workspaceMember { id } }
}
"""

class TwentyError(Exception):
    pass


class TwentyUnauthenticated(TwentyError):
    pass


class TwentyForbidden(TwentyError):
    pass


class TwentyNotFound(TwentyError):
    pass


class TwentyUnavailable(TwentyError):
    pass


@dataclass(frozen=True)
class TwentyUser:
    user_id: str
    workspace_id: str
    workspace_member_id: str | None
    token: str

    def __repr__(self) -> str:
        return f"TwentyUser(user_id={self.user_id!r}, workspace_id={self.workspace_id!r})"


@dataclass(frozen=True)
class Attachment:
    id: str
    name: str
    file_id: str | None
    extension: str | None
    url: str | None
    linked_object: str | None
    linked_record_id: str | None
    created_by_workspace_member_id: str | None


class TwentyClient:
    def __init__(
        self,
        base_url: str,
        timeout: float,
        download_hosts: list[str] | None = None,
        transport: httpx.BaseTransport | None = None,
        public_url: str | None = None,
    ) -> None:
        self.base_url = base_url.rstrip("/")
        self.public_url = public_url.rstrip("/") if public_url else None
        self.allowed_hosts = {urlsplit(self.base_url).hostname} | {
            host.lower() for host in download_hosts or []
        }
        self.client = httpx.Client(
            timeout=timeout,
            transport=transport,
            follow_redirects=False,
            headers={"User-Agent": "redsky-ocr"},
        )

    def close(self) -> None:
        self.client.close()

    def current_user(self, token: str) -> TwentyUser:
        data = self._graphql("/metadata", CURRENT_USER_QUERY, {}, token)
        user = data.get("currentUser") or {}
        workspace = user.get("currentWorkspace") or {}
        if not user.get("id") or not workspace.get("id"):
            raise TwentyUnauthenticated("The token does not belong to a workspace user.")
        member = user.get("workspaceMember") or {}
        return TwentyUser(
            user_id=user["id"],
            workspace_id=workspace["id"],
            workspace_member_id=member.get("id"),
            token=token,
        )

    def get_attachment(self, token: str, attachment_id: str) -> Attachment:
        # REST returns every field, including target fields for custom
        # objects that a static GraphQL selection could not name. It runs
        # through Twenty's permission checks for the token's role.
        response = self._request("GET", f"/rest/attachments/{attachment_id}", token)
        record = (response.get("data") or {}).get("attachment")
        if not record:
            raise TwentyNotFound("Attachment not found.")
        return parse_attachment(record)

    def current_workspace_id(self, token: str) -> str:
        data = self._graphql("/metadata", "{ currentWorkspace { id } }", {}, token)
        workspace = data.get("currentWorkspace") or {}
        if not workspace.get("id"):
            raise TwentyUnauthenticated("The token does not belong to a workspace.")
        return workspace["id"]

    def list_attachments_created_since(
        self, token: str, since: str, after: str | None = None, limit: int = 60
    ) -> tuple[list[tuple[Attachment, str]], str | None]:
        # Oldest first, so a sweep that stops early resumes where it stopped.
        params = {
            "filter": f'createdAt[gte]:"{twenty_timestamp(since)}"',
            "order_by": "createdAt[AscNullsFirst]",
            "limit": str(limit),
        }
        if after:
            params["starting_after"] = after
        response = self._request("GET", f"/rest/attachments?{httpx.QueryParams(params)}", token)
        records = (response.get("data") or {}).get("attachments") or []
        page = response.get("pageInfo") or {}
        next_cursor = page.get("endCursor") if page.get("hasNextPage") else None
        return [(parse_attachment(record), record["createdAt"]) for record in records], next_cursor

    def can_read_attachment(self, token: str, attachment_id: str) -> bool:
        try:
            self.get_attachment(token, attachment_id)
        except (TwentyForbidden, TwentyNotFound):
            return False
        return True

    def download(self, url: str, max_bytes: int) -> bytes:
        current = self._absolute(url)
        for _ in range(MAX_REDIRECTS + 1):
            # Signed file URLs carry their own token; no credentials are sent.
            self._check_host(current)
            try:
                with self.client.stream("GET", current) as response:
                    if response.is_redirect:
                        current = urljoin(current, response.headers["location"])
                        continue
                    if response.status_code == 404:
                        raise TwentyNotFound("The file no longer exists in Twenty.")
                    if response.status_code >= 400:
                        raise TwentyUnavailable(
                            f"Twenty refused the file download ({response.status_code})."
                        )
                    declared = response.headers.get("content-length")
                    if declared and declared.isdigit() and int(declared) > max_bytes:
                        raise FileTooLarge()
                    chunks: list[bytes] = []
                    received = 0
                    for chunk in response.iter_bytes():
                        received += len(chunk)
                        if received > max_bytes:
                            raise FileTooLarge()
                        chunks.append(chunk)
                    return b"".join(chunks)
            except httpx.HTTPError as error:
                raise TwentyUnavailable("Downloading the file from Twenty failed.") from error
        raise TwentyUnavailable("Too many redirects downloading the file.")

    def _absolute(self, url: str) -> str:
        if not urlsplit(url).scheme:
            return urljoin(self.base_url + "/", url.lstrip("/"))
        # Twenty signs file URLs with its public SERVER_URL; fetch them over
        # the private URL instead so file bytes stay on the private network.
        if self.public_url and (url == self.public_url or url.startswith(self.public_url + "/")):
            return self.base_url + url[len(self.public_url) :]
        return url

    def _check_host(self, url: str) -> None:
        parts = urlsplit(url)
        if parts.scheme not in ("http", "https") or (parts.hostname or "").lower() not in self.allowed_hosts:
            raise TwentyError(f"Refusing to fetch from {parts.hostname}; it is not an allowed host.")

    def _graphql(
        self, path: str, query: str, variables: dict[str, Any], token: str
    ) -> dict[str, Any]:
        payload = self._request(
            "POST", path, token, json={"query": query, "variables": variables}
        )
        graphql_errors = payload.get("errors") or []
        if graphql_errors:
            codes = {
                (error.get("extensions") or {}).get("code") for error in graphql_errors
            }
            if codes & {"UNAUTHENTICATED"}:
                raise TwentyUnauthenticated("Twenty rejected the token.")
            if codes & {"FORBIDDEN"}:
                raise TwentyForbidden("Twenty denied the request.")
            if codes & {"NOT_FOUND"}:
                raise TwentyNotFound("Twenty could not find the record.")
            raise TwentyError("Twenty returned an error.")
        return payload.get("data") or {}

    def _request(
        self, method: str, path: str, token: str, json: Any | None = None
    ) -> dict[str, Any]:
        try:
            response = self.client.request(
                method,
                f"{self.base_url}{path}",
                json=json,
                headers={"Authorization": f"Bearer {token}"},
            )
        except httpx.HTTPError as error:
            raise TwentyUnavailable("Twenty is unreachable.") from error
        if response.status_code == 401:
            raise TwentyUnauthenticated("Twenty rejected the token.")
        if response.status_code == 403:
            raise TwentyForbidden("Twenty denied the request.")
        if response.status_code == 404:
            raise TwentyNotFound("Twenty could not find the record.")
        if response.status_code >= 500:
            raise TwentyUnavailable(f"Twenty returned {response.status_code}.")
        try:
            body = response.json()
        except ValueError as error:
            raise TwentyUnavailable("Twenty returned a response that is not JSON.") from error
        if response.status_code >= 400:
            # REST errors look like {"statusCode", "error", "code"?, "messages"}.
            code = str(body.get("code") or body.get("error") or "").upper()
            if code in ("UNAUTHENTICATED", "NO_AUTHENTICATION_CONTEXT"):
                raise TwentyUnauthenticated("Twenty rejected the token.")
            if "FORBIDDEN" in code or "PERMISSION" in code:
                raise TwentyForbidden("Twenty denied the request.")
            if method == "GET" and response.status_code == 400:
                # A malformed record id: nothing to see.
                raise TwentyNotFound("Twenty could not find the record.")
            raise TwentyError(f"Twenty returned {response.status_code} ({code or 'no code'}).")
        return body


class FileTooLarge(TwentyError):
    pass


def twenty_timestamp(value: str) -> str:
    # Twenty's date filters reject microseconds; send UTC milliseconds.
    moment = datetime.fromisoformat(value.replace("Z", "+00:00"))
    if moment.tzinfo is None:
        moment = moment.replace(tzinfo=UTC)
    return moment.astimezone(UTC).isoformat(timespec="milliseconds").replace("+00:00", "Z")


def parse_attachment(record: dict[str, Any]) -> Attachment:
    files = record.get("file") or []
    file = files[0] if files else {}
    linked_object = None
    linked_record_id = None
    for key, value in record.items():
        match = TARGET_FIELD.match(key)
        if match and value:
            name = match.group(1)
            linked_object = name[:1].lower() + name[1:]
            linked_record_id = value
            break
    created_by = record.get("createdBy") or {}
    return Attachment(
        id=record["id"],
        name=record.get("name") or file.get("label") or "document",
        file_id=file.get("fileId"),
        extension=file.get("extension"),
        url=file.get("url"),
        linked_object=linked_object,
        linked_record_id=linked_record_id,
        created_by_workspace_member_id=created_by.get("workspaceMemberId"),
    )
