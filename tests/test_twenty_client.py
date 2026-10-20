import httpx
import pytest

from redsky_ocr.twenty import (
    FileTooLarge,
    TwentyClient,
    TwentyError,
    TwentyForbidden,
    TwentyNotFound,
    TwentyUnauthenticated,
    TwentyUnavailable,
    parse_attachment,
)

BASE = "http://twenty.railway.internal:3000"


def client_for(handler, **kwargs) -> TwentyClient:
    return TwentyClient(BASE, 5, transport=httpx.MockTransport(handler), **kwargs)


@pytest.mark.parametrize(
    ("response", "error"),
    [
        (httpx.Response(401, json={"statusCode": 401, "messages": ["Token invalid."], "error": "UNAUTHENTICATED"}), TwentyUnauthenticated),
        (
            httpx.Response(
                400,
                json={"statusCode": 400, "error": "Error", "code": "NO_AUTHENTICATION_CONTEXT", "messages": ["Authentication context is invalid"]},
            ),
            TwentyUnauthenticated,
        ),
        (
            httpx.Response(400, json={"statusCode": 400, "error": "Error", "code": "PERMISSION_DENIED", "messages": ["no permission"]}),
            TwentyForbidden,
        ),
        (httpx.Response(404, json={"statusCode": 404, "error": "NotFoundException"}), TwentyNotFound),
        (httpx.Response(400, json={"statusCode": 400, "error": "BadRequestException"}), TwentyNotFound),
        (httpx.Response(502, text="bad gateway"), TwentyUnavailable),
    ],
)
def test_rest_errors_are_classified(response, error):
    client = client_for(lambda request: response)

    with pytest.raises(error):
        client.get_attachment("token", "00000000-0000-4000-8000-000000000000")


def test_graphql_auth_errors_arrive_with_http_200():
    client = client_for(
        lambda request: httpx.Response(200, json={"errors": [{"message": "Token invalid.", "extensions": {"code": "UNAUTHENTICATED"}}]})
    )

    with pytest.raises(TwentyUnauthenticated):
        client.current_user("token")


def test_network_failure_is_unavailable_not_denied():
    def fail(request):
        raise httpx.ConnectError("refused")

    with pytest.raises(TwentyUnavailable):
        client_for(fail).current_user("token")


def test_signed_urls_are_fetched_over_the_private_url():
    seen = []

    def handler(request):
        seen.append(str(request.url))
        return httpx.Response(200, content=b"%PDF-1.7")

    client = client_for(handler, public_url="https://crm.rsmcapital.example")

    client.download("https://crm.rsmcapital.example/file/files-field/abc?token=t", 1024)

    assert seen == [f"{BASE}/file/files-field/abc?token=t"]


def test_downloads_refuse_hosts_that_are_not_allowed():
    client = client_for(lambda request: httpx.Response(200, content=b"x"))

    with pytest.raises(TwentyError, match="not an allowed host"):
        client.download("http://169.254.169.254/latest/meta-data", 1024)


def test_redirects_are_followed_only_to_allowed_hosts():
    def handler(request):
        if request.url.host == "twenty.railway.internal":
            return httpx.Response(302, headers={"location": "https://bucket.storage.example/object?signature=s"})
        return httpx.Response(200, content=b"%PDF-1.7 bytes")

    assert client_for(handler, download_hosts=["bucket.storage.example"]).download(f"{BASE}/file/x", 1024) == b"%PDF-1.7 bytes"
    with pytest.raises(TwentyError, match="not an allowed host"):
        client_for(handler).download(f"{BASE}/file/x", 1024)


def test_downloads_stop_at_the_size_limit():
    client = client_for(lambda request: httpx.Response(200, content=b"x" * 5000))

    with pytest.raises(FileTooLarge):
        client.download(f"{BASE}/file/x", 1024)


def test_attachment_targets_include_custom_objects():
    attachment = parse_attachment(
        {
            "id": "a",
            "name": "IC memo.pdf",
            "targetCompanyId": None,
            "targetDealId": "deal-1",
            "file": [{"fileId": "f", "label": "IC memo.pdf", "extension": ".pdf", "url": "u"}],
            "createdBy": {"workspaceMemberId": "m"},
        }
    )

    assert (attachment.linked_object, attachment.linked_record_id) == ("deal", "deal-1")
    assert attachment.created_by_workspace_member_id == "m"
