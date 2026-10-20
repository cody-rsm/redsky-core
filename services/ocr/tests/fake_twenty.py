import json
import re
import uuid
from dataclasses import dataclass, field
from datetime import UTC, datetime

import httpx

# Responses mirror what Twenty v2.44 returned in a live run (see the README's
# testing section): GraphQL errors arrive with HTTP 200, REST permission
# failures are HTTP 400 with code PERMISSION_DENIED, and a record the caller
# may not see is a 404.
BASE_URL = "http://twenty.test"
PUBLIC_URL = "https://crm.example.test"
TARGET_FIELDS = (
    "targetCompanyId",
    "targetPersonId",
    "targetOpportunityId",
    "targetNoteId",
    "targetTaskId",
)


@dataclass
class FakeUser:
    token: str
    user_id: str
    workspace_id: str
    workspace_member_id: str | None
    # Object types this role may read; attachments also need their parent's.
    readable: set[str] = field(default_factory=lambda: {"attachment", "company", "person"})
    is_api_key: bool = False


@dataclass
class FakeAttachment:
    id: str
    workspace_id: str
    name: str
    data: bytes
    target_field: str | None
    target_id: str | None
    file_id: str = field(default_factory=lambda: str(uuid.uuid4()))
    created_by: str | None = None
    created_at: str = field(
        default_factory=lambda: datetime.now(UTC).isoformat(timespec="milliseconds").replace("+00:00", "Z")
    )


class FakeTwenty:
    def __init__(self) -> None:
        self.users: dict[str, FakeUser] = {}
        self.attachments: dict[str, FakeAttachment] = {}
        self.pending_uploads: dict[str, dict] = {}
        self.available = True
        self.calls: list[str] = []

    def add_user(self, workspace_id: str, readable: set[str] | None = None, is_api_key: bool = False) -> FakeUser:
        user = FakeUser(
            token=f"token-{uuid.uuid4()}",
            user_id=str(uuid.uuid4()),
            workspace_id=workspace_id,
            workspace_member_id=None if is_api_key else str(uuid.uuid4()),
            is_api_key=is_api_key,
        )
        if readable is not None:
            user.readable = readable
        self.users[user.token] = user
        return user

    def add_attachment(
        self,
        workspace_id: str,
        name: str,
        data: bytes,
        target_field: str | None = "targetCompanyId",
        target_id: str | None = None,
    ) -> FakeAttachment:
        attachment = FakeAttachment(
            id=str(uuid.uuid4()),
            workspace_id=workspace_id,
            name=name,
            data=data,
            target_field=target_field,
            target_id=target_id or str(uuid.uuid4()),
        )
        self.attachments[attachment.id] = attachment
        return attachment

    def record(self, attachment: FakeAttachment, with_url: bool = True) -> dict:
        record = {
            "id": attachment.id,
            "createdAt": attachment.created_at,
            "name": attachment.name,
            "createdBy": {"source": "MANUAL", "workspaceMemberId": attachment.created_by},
            "file": [
                {
                    "fileId": attachment.file_id,
                    "label": attachment.name,
                    "extension": "." + attachment.name.rsplit(".", 1)[-1],
                    **(
                        {"url": f"{PUBLIC_URL}/file/files-field/{attachment.file_id}?token=signed"}
                        if with_url
                        else {}
                    ),
                }
            ],
        }
        for target in TARGET_FIELDS:
            record[target] = attachment.target_id if target == attachment.target_field else None
        return record

    def transport(self) -> httpx.MockTransport:
        return httpx.MockTransport(self.handle)

    def handle(self, request: httpx.Request) -> httpx.Response:
        self.calls.append(f"{request.method} {request.url.path}")
        if not self.available:
            return httpx.Response(502, text="Bad gateway")
        path = request.url.path
        if request.method == "GET" and path.startswith("/file/files-field/"):
            file_id = path.rsplit("/", 1)[-1]
            for attachment in self.attachments.values():
                if attachment.file_id == file_id:
                    return httpx.Response(200, content=attachment.data)
            return httpx.Response(404)
        if request.method == "PUT" and path.startswith("/file-upload/"):
            self.pending_uploads[path.rsplit("/", 1)[-1]]["data"] = request.content
            return httpx.Response(200)

        user = self.users.get(request.headers.get("authorization", "").removeprefix("Bearer "))
        if path == "/metadata":
            return self._metadata(user, json.loads(request.content))
        if user is None:
            return httpx.Response(
                401, json={"statusCode": 401, "messages": ["Token invalid."], "error": "UNAUTHENTICATED"}
            )
        if request.method == "GET" and path == "/rest/attachments":
            return self._list_attachments(user, request.url.params)
        match = re.fullmatch(r"/rest/attachments/([^/]+)", path)
        if request.method == "GET" and match:
            return self._get_attachment(user, match.group(1))
        if request.method == "POST" and path == "/rest/attachments":
            return self._create_attachment(user, json.loads(request.content))
        return httpx.Response(404, json={"statusCode": 404, "error": "NotFoundException"})

    def _metadata(self, user: FakeUser | None, payload: dict) -> httpx.Response:
        query = payload["query"]
        if user is None:
            return httpx.Response(
                200,
                json={
                    "errors": [
                        {"message": "Token invalid.", "extensions": {"code": "UNAUTHENTICATED"}}
                    ]
                },
            )
        if "currentWorkspace" in query and "currentUser" not in query:
            return httpx.Response(200, json={"data": {"currentWorkspace": {"id": user.workspace_id}}})
        if "currentUser" in query:
            if user.is_api_key:
                return httpx.Response(
                    200,
                    json={"errors": [{"message": "Forbidden", "extensions": {"code": "FORBIDDEN"}}]},
                )
            return httpx.Response(
                200,
                json={
                    "data": {
                        "currentUser": {
                            "id": user.user_id,
                            "currentWorkspace": {"id": user.workspace_id},
                            "workspaceMember": {"id": user.workspace_member_id},
                        }
                    }
                },
            )
        if "createFileUpload" in query:
            file_id = str(uuid.uuid4())
            self.pending_uploads[file_id] = {"workspace": user.workspace_id}
            return httpx.Response(
                200,
                json={
                    "data": {
                        "createFileUpload": {
                            "fileId": file_id,
                            "uploadUrl": f"{BASE_URL}/file-upload/{file_id}?token=upload",
                            "contentType": "application/octet-stream",
                        }
                    }
                },
            )
        if "completeFileUpload" in query:
            return httpx.Response(200, json={"data": {"completeFileUpload": {"id": payload["variables"]["fileId"]}}})
        return httpx.Response(200, json={"errors": [{"message": "Unknown", "extensions": {"code": "BAD_REQUEST"}}]})

    def _denied(self) -> httpx.Response:
        return httpx.Response(
            400,
            json={
                "statusCode": 400,
                "error": "Error",
                "messages": ["Entity performing the request does not have permission"],
                "code": "PERMISSION_DENIED",
            },
        )

    def _get_attachment(self, user: FakeUser, attachment_id: str) -> httpx.Response:
        if "attachment" not in user.readable:
            return self._denied()
        attachment = self.attachments.get(attachment_id)
        if attachment is None or attachment.workspace_id != user.workspace_id:
            return httpx.Response(404, json={"statusCode": 404, "error": "NotFoundException", "messages": ["Record not found"]})
        parent = attachment.target_field.removeprefix("target").removesuffix("Id").lower() if attachment.target_field else None
        # Twenty gates attachments through the parent record's access policy.
        if parent is not None and parent not in user.readable:
            return httpx.Response(404, json={"statusCode": 404, "error": "NotFoundException", "messages": ["Record not found"]})
        return httpx.Response(200, json={"data": {"attachment": self.record(attachment)}})

    def _list_attachments(self, user: FakeUser, params) -> httpx.Response:
        since = re.fullmatch(r'createdAt\[gte\]:"(.+)"', params["filter"]).group(1)
        if re.search(r"\.\d{4,}", since):
            # Twenty 2.44 refuses sub-millisecond precision in date filters.
            return httpx.Response(400, json={"statusCode": 400, "error": "BadRequestException"})
        assert params["order_by"] == "createdAt[AscNullsFirst]"
        matching = sorted(
            (
                attachment
                for attachment in self.attachments.values()
                if attachment.workspace_id == user.workspace_id
                and datetime.fromisoformat(attachment.created_at.replace("Z", "+00:00"))
                >= datetime.fromisoformat(since.replace("Z", "+00:00"))
            ),
            key=lambda attachment: attachment.created_at,
        )
        start = int(params.get("starting_after", 0))
        limit = int(params["limit"])
        page = matching[start : start + limit]
        has_next = start + limit < len(matching)
        return httpx.Response(
            200,
            json={
                "data": {"attachments": [self.record(attachment) for attachment in page]},
                "pageInfo": {"hasNextPage": has_next, "endCursor": str(start + limit)},
                "totalCount": len(matching),
            },
        )

    def _create_attachment(self, user: FakeUser, body: dict) -> httpx.Response:
        file_id = body["file"][0]["fileId"]
        upload = self.pending_uploads.pop(file_id)
        target_field = next(key for key in body if key.startswith("target"))
        attachment = FakeAttachment(
            id=str(uuid.uuid4()),
            workspace_id=user.workspace_id,
            name=body["name"],
            data=upload["data"],
            target_field=target_field,
            target_id=body[target_field],
            file_id=file_id,
            created_by=user.workspace_member_id,
        )
        self.attachments[attachment.id] = attachment
        return httpx.Response(201, json={"data": {"createAttachment": self.record(attachment)}})
