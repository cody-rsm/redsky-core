import argparse
import secrets
import sys
import time
from pathlib import Path

import httpx

sys.path.insert(0, str(Path(__file__).resolve().parents[1] / "tests"))

from sample_documents import generate  # noqa: E402


# Checks redsky-ocr against a real Twenty: run it against
# docker-compose.dev.yml after every Twenty upgrade. It creates synthetic
# users, roles, an API key and a webhook, so never point it at real data.
PASSWORD = "Synthetic-Passw0rd!"
ADMIN = "admin@redsky-ocr.test"
ANALYST = "analyst@redsky-ocr.test"


class Twenty:
    def __init__(self, url: str) -> None:
        self.url = url

    def gql(self, query: str, variables: dict | None = None, token: str | None = None) -> dict:
        headers = {"Authorization": f"Bearer {token}"} if token else {}
        body = httpx.post(
            f"{self.url}/metadata", json={"query": query, "variables": variables or {}}, headers=headers, timeout=60
        ).json()
        if body.get("errors"):
            raise RuntimeError(body["errors"][0].get("message"))
        return body["data"]

    def login(self, email: str) -> str:
        token = self.gql(
            'mutation($e:String!,$p:String!){ getLoginTokenFromCredentials(email:$e, password:$p, origin:"%s"){ loginToken { token } } }'
            % self.url,
            {"e": email, "p": PASSWORD},
        )["getLoginTokenFromCredentials"]["loginToken"]["token"]
        return self.gql(
            'mutation($t:String!){ getAuthTokensFromLoginToken(loginToken:$t, origin:"%s"){ tokens { accessOrWorkspaceAgnosticToken { token } } } }'
            % self.url,
            {"t": token},
        )["getAuthTokensFromLoginToken"]["tokens"]["accessOrWorkspaceAgnosticToken"]["token"]

    def bootstrap_admin(self) -> str:
        try:
            return self.login(ADMIN)
        except RuntimeError:
            pass
        agnostic = self.gql(
            "mutation($e:String!,$p:String!){ signUp(email:$e, password:$p){ tokens { accessOrWorkspaceAgnosticToken { token } } } }",
            {"e": ADMIN, "p": PASSWORD},
        )["signUp"]["tokens"]["accessOrWorkspaceAgnosticToken"]["token"]
        login_token = self.gql(
            'mutation { signUpInNewWorkspace(input:{displayName:"redsky-ocr e2e"}) { loginToken { token } } }', token=agnostic
        )["signUpInNewWorkspace"]["loginToken"]["token"]
        access = self.gql(
            'mutation($t:String!){ getAuthTokensFromLoginToken(loginToken:$t, origin:"%s"){ tokens { accessOrWorkspaceAgnosticToken { token } } } }'
            % self.url,
            {"t": login_token},
        )["getAuthTokensFromLoginToken"]["tokens"]["accessOrWorkspaceAgnosticToken"]["token"]
        self.gql('mutation { activateWorkspace(data:{displayName:"redsky-ocr e2e"}) { id } }', token=access)
        # The workspace member exists only after activation; sign in again.
        return self.login(ADMIN)

    def role(self, admin: str, label: str, read: list[str], read_all: bool, users: bool) -> str:
        roles = {role["label"]: role["id"] for role in self.gql("{ getRoles { id label } }", token=admin)["getRoles"]}
        if label in roles:
            return roles[label]
        role_id = self.gql(
            "mutation($i: CreateRoleInput!){ createOneRole(createRoleInput:$i){ id } }",
            {
                "i": {
                    "label": label,
                    "canReadAllObjectRecords": read_all,
                    "canUpdateAllObjectRecords": read_all,
                    "canSoftDeleteAllObjectRecords": False,
                    "canDestroyAllObjectRecords": False,
                    "canUpdateAllSettings": False,
                    "canAccessAllTools": False,
                    "canBeAssignedToUsers": users,
                    "canBeAssignedToApiKeys": not users,
                }
            },
            token=admin,
        )["createOneRole"]["id"]
        objects = {
            edge["node"]["nameSingular"]: edge["node"]["id"]
            for edge in self.gql("{ objects(paging:{first:200}) { edges { node { id nameSingular } } } }", token=admin)[
                "objects"
            ]["edges"]
        }
        self.gql(
            "mutation($i: UpsertObjectPermissionsInput!){ upsertObjectPermissions(upsertObjectPermissionsInput:$i){ objectMetadataId } }",
            {
                "i": {
                    "roleId": role_id,
                    "objectPermissions": [
                        {
                            "objectMetadataId": objects[name],
                            "canReadObjectRecords": allowed,
                            "canUpdateObjectRecords": False,
                            "canSoftDeleteObjectRecords": False,
                            "canDestroyObjectRecords": False,
                        }
                        for name, allowed in read
                    ],
                }
            },
            token=admin,
        )
        return role_id


def check(label: str, condition: bool, failures: list[str]) -> None:
    print(f"  {'ok  ' if condition else 'FAIL'} {label}")
    if not condition:
        failures.append(label)


def bootstrap(twenty: Twenty, arguments: argparse.Namespace) -> None:
    admin = twenty.bootstrap_admin()
    workspace = twenty.gql("{ currentWorkspace { id inviteHash } }", token=admin)["currentWorkspace"]
    # The production role: read-only on attachments and on the record types
    # they hang off, because Twenty hides an attachment whose parent the
    # caller cannot read.
    ocr_role = twenty.role(
        admin,
        "RedSky OCR",
        [(name, True) for name in ("attachment", "company", "person", "opportunity", "note", "task")],
        read_all=False,
        users=False,
    )
    key_id = twenty.gql(
        "mutation($i: CreateApiKeyInput!){ createApiKey(input:$i){ id } }",
        {"i": {"name": f"redsky-ocr e2e {secrets.token_hex(3)}", "expiresAt": "2099-01-01T00:00:00Z", "roleId": ocr_role}},
        token=admin,
    )["createApiKey"]["id"]
    api_key = twenty.gql(
        "mutation($id: UUID!, $e: String!){ generateApiKeyToken(apiKeyId:$id, expiresAt:$e){ token } }",
        {"id": key_id, "e": "2099-01-01T00:00:00Z"},
        token=admin,
    )["generateApiKeyToken"]["token"]
    try:
        analyst = twenty.login(ANALYST)
    except RuntimeError:
        twenty.gql(
            "mutation($e:String!,$p:String!,$w:UUID!,$h:String!){ signUpInWorkspace(email:$e, password:$p, workspaceId:$w, workspaceInviteHash:$h){ workspace { id } } }",
            {"e": ANALYST, "p": PASSWORD, "w": workspace["id"], "h": workspace["inviteHash"]},
        )
        analyst = twenty.login(ANALYST)
    no_files = twenty.role(admin, "No files", [("attachment", False)], read_all=True, users=True)
    member = twenty.gql("{ currentUser { workspaceMember { id } } }", token=analyst)["currentUser"]["workspaceMember"]["id"]
    twenty.gql(
        "mutation($m:UUID!,$r:UUID!){ updateWorkspaceMemberRole(workspaceMemberId:$m, roleId:$r){ id } }",
        {"m": member, "r": no_files},
        token=admin,
    )
    hooks = twenty.gql("{ webhooks { id targetUrl } }", token=admin)["webhooks"]
    if not any(hook["targetUrl"] == arguments.webhook_url for hook in hooks):
        twenty.gql(
            "mutation($i: CreateWebhookInput!){ createWebhook(input:$i){ id } }",
            {"i": {"targetUrl": arguments.webhook_url, "operations": ["attachment.*"], "secret": arguments.webhook_secret}},
            token=admin,
        )
    Path(".e2e-api-key").write_text(api_key)
    print("Twenty is ready. Start redsky-ocr with:")
    print("  REDSKY_OCR_TWENTY_API_KEY=$(cat .e2e-api-key) REDSKY_OCR_ACCEPT_TWENTY_TOKENS=true")
    print(f"  REDSKY_OCR_TWENTY_WEBHOOK_SECRET=<the --webhook-secret you passed>")
    print("then run: python scripts/e2e_twenty.py run")


def upload_attachment(twenty_url: str, token: str, filename: str, data: bytes, company_id: str) -> str:
    # What the Files tab does: create an upload target, PUT the bytes,
    # complete it, then create the attachment record.
    twenty = Twenty(twenty_url)
    target = twenty.gql(
        """mutation($f: String!, $s: Float!) {
          createFileUpload(filename: $f, size: $s, fileFolder: FilesField,
            fieldMetadataUniversalIdentifier: "20202020-15db-460e-8166-c7b5d87ad4be")
          { fileId uploadUrl contentType } }""",
        {"f": filename, "s": len(data)},
        token=token,
    )["createFileUpload"]
    httpx.put(target["uploadUrl"], content=data, headers={"Content-Type": target["contentType"]}).raise_for_status()
    twenty.gql("mutation($id: String!){ completeFileUpload(fileId: $id) { id } }", {"id": target["fileId"]}, token=token)
    created = httpx.post(
        f"{twenty_url}/rest/attachments",
        json={"name": filename, "targetCompanyId": company_id, "file": [{"fileId": target["fileId"], "label": filename}]},
        headers={"Authorization": f"Bearer {token}"},
    )
    created.raise_for_status()
    return created.json()["data"]["createAttachment"]["id"]


def run(twenty: Twenty, arguments: argparse.Namespace) -> list[str]:
    failures: list[str] = []
    admin = twenty.login(ADMIN)
    analyst = twenty.login(ANALYST)
    headers = {"Authorization": f"Bearer {admin}"}
    analyst_headers = {"Authorization": f"Bearer {analyst}"}
    if not httpx.get(f"{arguments.ocr_url}/ready").is_success:
        raise SystemExit("redsky-ocr is not ready")
    workspace_id = twenty.gql("{ currentWorkspace { id } }", token=admin)["currentWorkspace"]["id"]
    company = httpx.post(
        f"{arguments.twenty_url}/rest/companies", json={"name": "Northwind Test Holdings"}, headers=headers
    ).json()["data"]["createCompany"]["id"]
    samples = generate(Path(".e2e-samples"), include_bad=False)

    print("Webhook ingestion")
    attachment = upload_attachment(
        arguments.twenty_url, admin, "scanned.pdf", samples["scanned.pdf"].path.read_bytes(), company
    )
    document = None
    for _ in range(90):
        found = httpx.get(
            f"{arguments.ocr_url}/api/v1/documents", params={"sourceId": attachment}, headers=headers
        ).json()["documents"]
        if found and found[0]["status"] not in ("queued", "processing"):
            document = found[0]
            break
        time.sleep(1)
    check("an attachment uploaded in Twenty is extracted automatically", bool(document) and document["status"] == "completed", failures)

    if document:
        url = f"{arguments.ocr_url}/api/v1/documents/{document['id']}"
        print("Access control (Twenty tokens)")
        check("the uploader can read the text", httpx.get(f"{url}/content", headers=headers).status_code == 200, failures)
        check("a user without file access gets 404", httpx.get(url, headers=analyst_headers).status_code == 404, failures)
        check(
            "search hides documents the user cannot see",
            httpx.get(f"{arguments.ocr_url}/api/v1/search", params={"q": "revenue"}, headers=analyst_headers).json()["results"] == [],
            failures,
        )
        check("an invalid token gets 401", httpx.get(url, headers={"Authorization": "Bearer invalid"}).status_code == 401, failures)

        if arguments.service_token:
            print("RedSky API (service token)")
            gateway = {
                "Authorization": f"Bearer {arguments.service_token}",
                "X-RedSky-Tenant-Id": workspace_id,
                "X-RedSky-User-Id": "e2e-check",
            }
            check("the RedSky API reads the same document", httpx.get(f"{url}/content", headers=gateway).status_code == 200, failures)
            other = {**gateway, "X-RedSky-Tenant-Id": "another-tenant"}
            check("another tenant gets 404", httpx.get(url, headers=other).status_code == 404, failures)

        print("Deletion")
        httpx.delete(f"{arguments.twenty_url}/rest/attachments/{attachment}", headers=headers)
        time.sleep(5)
        check("deleting the attachment purges its text", httpx.get(url, headers=headers).status_code == 404, failures)
    return failures


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("command", choices=["bootstrap", "run"])
    parser.add_argument("--twenty-url", default="http://localhost:3000")
    parser.add_argument("--ocr-url", default="http://localhost:8080")
    parser.add_argument("--webhook-url", default="http://redsky-ocr:8080/api/v1/webhooks/twenty")
    parser.add_argument("--webhook-secret", help="bootstrap: the REDSKY_OCR_TWENTY_WEBHOOK_SECRET redsky-ocr will use")
    parser.add_argument("--service-token", help="run: one of REDSKY_OCR_SERVICE_TOKENS, to check calls from the RedSky API")
    arguments = parser.parse_args()
    twenty = Twenty(arguments.twenty_url)
    if arguments.command == "bootstrap":
        if not arguments.webhook_secret:
            parser.error("bootstrap needs --webhook-secret")
        bootstrap(twenty, arguments)
        return
    failures = run(twenty, arguments)
    print("PASSED" if not failures else f"FAILED: {failures}")
    sys.exit(1 if failures else 0)


if __name__ == "__main__":
    main()
