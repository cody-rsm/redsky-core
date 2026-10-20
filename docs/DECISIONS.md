# Decision record

Decisions that shape the RedSky platform. Each one has a number, a status and the reasoning behind it. Add new ones at the end, and don't rewrite a settled decision: supersede it with a new entry. Decisions about the Twenty fork itself live in `cody-rsm/redsky-twenty`'s `rsm/docs/DECISIONS.md`.

| # | Decision | Status | Date |
|---|---|---|---|
| 1 | One owner per record type; Twenty is replaced one area at a time | Decided | 2026-10-20 |
| 2 | One sign-in (Entra ID); permissions are enforced where the record lives | Decided | 2026-10-20 |
| 3 | Documents live in RedSky storage; SharePoint stays the deal-system home | Decided | 2026-10-20 |
| 4 | Services talk over versioned HTTP APIs and signed events, never shared queues | Decided | 2026-10-20 |
| 5 | Two repositories: `redsky-core` for the platform, `redsky-twenty` for the CRM | Decided | 2026-10-20 |
| 6 | OCRmyPDF (searchable-PDF copies) | Open: waits on the AGPL position | |
| 7 | How the RedSky API reads Twenty as the signed-in user: each person connects through Twenty's OAuth | Decided | 2026-10-20 |
| 8 | Document OCR as a private RedSky service (`redsky-ocr`) | Proposed: built, not deployed | 2026-10-20 |

## 1. One owner per record type; Twenty is replaced one area at a time

**Decision:**
- Every record type has exactly one owner, the system that stores it and accepts writes to it. Today Twenty owns CRM records (companies, people, opportunities, notes, tasks attached to them). RedSky owns its workspace data (profiles, preferences, layouts, onboarding, Workstyle, RedSky tasks, AI conversations) and documents (decision 3).
- The RedSky API starts as a thin layer in front of Twenty plus RedSky's own services. Areas move from Twenty to RedSky one at a time, Documents first, then Deals and the rest. Each move changes the owner; it never adds a second one.
- Twenty is retired when the last area has moved.

**Why.** Two systems that both hold companies or deals need a two-way sync, and two-way syncs drift, duplicate and lose edits. One owner per record type keeps every write in one place and lets Twenty be replaced without a big-bang migration.

**Consequences:**
- No two-way sync between RedSky and Twenty, ever. Reading the other system's records through its API is fine; copying them into a second writable store is not.
- Moving an area follows the same steps each time:
  1. Build the area in RedSky behind the RedSky API.
  2. Migrate its records.
  3. Switch writes to RedSky.
  4. Make Twenty read-only for that area, then remove it there.
- Records keep links to records in other systems as `{system, object, id}` (for example `twenty/company/<uuid>`), so links survive a move: the move rewrites them.
- Scope: build the RedSky API, frontend, Documents and identity first. Other areas wait until those work.

## 2. One sign-in (Entra ID); permissions are enforced where the record lives

**Decision:**
- Microsoft Entra ID is the single sign-in for RedSky and Twenty: RedSky through its own OIDC client, Twenty through its Microsoft sign-in (not Twenty's Enterprise SSO).
- When the RedSky API reads Twenty data, it acts as the signed-in user, so Twenty's own permissions and deal walls apply.
- RedSky's own records are authorized in the RedSky API (`src/server/security/access-policy.ts`), the single place for RedSky permissions. Services behind the API, such as `redsky-ocr`, trust the API's decision and keep no permission model of their own.
- Never use an all-access Twenty key while re-implementing Twenty's permissions in RedSky.

**Why.** Two permission models for the same records disagree sooner or later, and a deal wall that only one of them knows about leaks. Enforcing permissions where a record lives means there is one model per record type, and it moves with the record (decision 1).

**Consequences:**
- The first Twenty adapter called Twenty with one shared API key (`TWENTY_API_KEY`), so every RedSky user saw what the key's role saw. Decision 7 replaced it with a token per person (2026-10-20).
- Admin rights in one system grant nothing in the other.

## 3. Documents live in RedSky storage; SharePoint stays the deal-system home

**Decision:**
- Files uploaded in RedSky go to a RedSky-owned bucket (`redsky-documents` on Railway), under `documents/<uuid>/<filename>`. The RedSky API writes them; `redsky-ocr` only reads them.
- SharePoint stays the home of the RSM Deal System's files. RedSky reaches it through a connector, as a source; it does not copy the deal system into the bucket.
- `redsky-ocr` reads originals from RedSky storage. Twenty attachments, and later SharePoint, are additional sources behind the same interface.
- Extracted text, pages, tables and chunks stay in Postgres, and embeddings will too (pgvector). Only large outputs go in the bucket.

**Why.** Documents are the first area to move out of Twenty (decision 1), so RedSky needs its own store for them. Keeping derived data in Postgres keeps search, permissions and deletion in one transactional place.

**Consequences:**
- Deleting an original deletes everything derived from it.
- `_NOAI` files are recorded and never extracted.
- The bucket is new infrastructure. It holds only originals uploaded in RedSky.
- Built in `redsky-web`'s Documents page (2026-10-20). A document is shared as "Only me" or "All RSM staff"; team and deal-team sharing waits for team membership, so the page doesn't offer an option it can't enforce.

## 4. Services talk over versioned HTTP APIs and signed events, never shared queues

**Decision:**
- A service's contract is its versioned HTTP API (`/api/v1/...`) plus signed events it sends to the RedSky API. For `redsky-ocr`, the event is "document finished" (`document.completed`, `document.needs_review`, `document.failed`), and `document.deleted`.
- No Redis or BullMQ queues shared between the TypeScript API and Python services. A service may queue its own work internally; `redsky-ocr` uses a Postgres table.
- Services are private (Railway private network, no public domain). The frontend calls only the RedSky API.
- Each service owns its database or schema. No service reads another's tables, and nothing reads Twenty's database.

**Why.** A shared queue couples two codebases to one job format, one library and one retry policy, across languages. HTTP plus events keeps each side replaceable and testable on its own.

**Consequences:**
- Events are delivered at least once: receivers verify the signature and treat the event id as an idempotency key.
- A breaking change to a contract means a new version path, with the old one kept until its callers move.

## 5. Two repositories: `redsky-core` for the platform, `redsky-twenty` for the CRM

**Decision:**
- `cody-rsm/redsky-core` (renamed from `cody-rsm/RedSky`) holds the platform: the RedSky web app and API at the root, and services under `services/` (`services/ocr` today).
- `cody-rsm/redsky-twenty` (renamed from `cody-rsm/rsm-crm`) holds RSM's private copy of Twenty and the Twenty apps that extend it. Twenty is a replaceable connected system: a separate repository and Railway service, reached only through its REST and GraphQL APIs, connecting mainly to Application Services (layer 3) and the Integration Hub (layer 4).
- New platform code goes in `redsky-core`. `redsky-twenty` gets only changes that must live inside Twenty while it owns CRM records.

**Why.** Twenty's upgrade cycle, licence questions and build are its own. Keeping the platform out of the fork means Twenty can be replaced, and upgraded, without touching RedSky.

**Consequences:**
- `redsky-ocr` moved here from `redsky-twenty` (`rsm/services/redsky-ocr`) with its history.
- GitHub redirects the old names, but documentation uses the new ones.

## 6. OCRmyPDF (searchable-PDF copies)

**Open.** OCRmyPDF overlaps with Docling for extraction, so it would be added only to produce searchable-PDF copies. It depends on Ghostscript, licensed AGPL or commercially. Decide after RSM's AGPL position for internal use (`redsky-twenty` decision 5).

## 7. How the RedSky API reads Twenty as the signed-in user

**Decided (2026-10-20).** Each person connects their own Twenty account to RedSky once, through Twenty's OAuth server, and the RedSky API reads Twenty with that person's token.

**Decision:**
- RedSky is registered in Twenty as one confidential OAuth client, with scopes `api profile` and the redirect address `<REDSKY_APP_URL>/api/integrations/twenty/callback` (`docs/DEPLOYMENT.md` §10). People connect from People or Settings › Connected apps and approve RedSky on Twenty's consent page. The flow is the authorization code grant with PKCE (S256), a state value and Twenty's `iss` response parameter, all checked.
- Twenty decides what each token can do. A user's token carries that person's Twenty role and deal walls (and, if the RedSky registration is ever given an app role, only what both roles allow). RedSky keeps no copy of Twenty's permissions: what Twenty refuses, RedSky doesn't show (People says the person's CRM role doesn't include people).
- The Twenty account must be the RedSky user. After the code exchange, RedSky asks Twenty whose token it is (`currentUser`). If that email is not the signed-in RedSky user's, RedSky revokes the grant and refuses the connection, so someone signed in to Twenty as a colleague can't act as them.
- Tokens are stored per person in `redsky.twenty_connections`, encrypted with AES-256-GCM under `REDSKY_ENCRYPTION_KEY` and bound to the user and token kind. Access tokens last 30 minutes and are refreshed on demand, once at a time per person; each refresh replaces the refresh token (60 days). Tokens never reach the browser or the logs.
- `TWENTY_API_KEY` is no longer read. RedSky reports it as a configuration issue if it is still set.

**Why.** Twenty 2.44 ships an OAuth 2.1 authorization server that issues per-user tokens (open-source code: no Enterprise licence, no core patch). Exchanging the person's Entra token for a Twenty token was the alternative, but Twenty's token endpoint accepts only the authorization-code and refresh grants, so it would need a patch to Twenty and a trust relationship to keep secure. With Twenty's own OAuth, Twenty stays the only issuer of access to its records.

**Consequences:**
- One extra step per person: connect once, and again if Twenty stops accepting the grant (revoked, or the refresh token unused for 60 days). Where CRM data would be, RedSky shows "Connect Twenty" or "Reconnect Twenty".
- Disconnecting (Settings › Connected apps) revokes the grant in Twenty and deletes the stored tokens. An access token Twenty already issued stays valid until it expires, at most 30 minutes later: Twenty cannot revoke access tokens.
- Deleting a RedSky user deletes their stored tokens. Removing someone from Twenty is still done in Twenty.
- Background jobs that need Twenty without a signed-in person can't use this. They need their own decision, never a shared all-access key (decision 2).
- If someone opens the consent page while signed out of Twenty, Twenty 2.44 shows its own home page after sign-in instead of returning to the consent page; they click Connect in RedSky again.

## 8. Document OCR as a private RedSky service (`redsky-ocr`)

**Proposed.** Built and tested in `services/ocr`; not deployed. Supersedes `redsky-twenty` decision 10, which placed it in that repository as a Twenty side service.

**Decision:**
- Extract text, tables and page structure with a Python service: Docling and Tesseract are Python, and OCR is heavy compute that should not run in the web process.
- Self-hosted and CPU-only: IBM Docling (layout and TableFormer models) and Tesseract. No outside OCR or AI service sees document content, and there are no per-page fees.
- No Chinese-developed OCR engines or models. RapidOCR/PaddleOCR, EasyOCR, Qwen utilities and model hubs such as ModelScope are refused at start-up by a dependency policy check. Granite Docling (IBM) is the only optional vision-language model, off by default.
- It follows decisions 2 to 4: private, called by the RedSky API with a service token naming the tenant and user, reading originals from sources, keeping derived data in its own `redsky_ocr` database on `redsky-postgres`, and sending signed events.

**Open points:**
1. Approve deploying it (`docs/DEPLOYMENT.md` §13) and the Twenty-side changes for the attachment source: one SSRF allow-list entry, a read-only role and API key, a webhook.
2. Confirm the provenance and licence of IBM's `docling-layout-heron` model on its model card (RT-DETRv2 architecture, first published by Baidu researchers; the weights are IBM's). The build environment could not reach Hugging Face to check.
3. Whether `_NOAI` should also block plain OCR, as implemented, or only AI use of its output.
