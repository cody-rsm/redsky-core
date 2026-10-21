# Decision record

Decisions that shape the RedSky platform. Each one has a number, a status and the reasoning behind it. Add new ones at the end, and don't rewrite a settled decision: supersede it with a new entry. Decisions about the Twenty fork itself live in `cody-rsm/redsky-twenty`'s `rsm/docs/DECISIONS.md`; decisions that affect both are noted in both.

Decisions 9 to 14 were first recorded on 2026-10-20 as 1 to 8 in a separate draft of this file. Merging the two drafts renumbered them, and folded two of them into 1 and 4, which already covered them.

| # | Decision | Status | Date |
|---|---|---|---|
| 1 | One owner per record type; Twenty is replaced one area at a time | Decided; its order of areas superseded by 15 | 2026-10-20 |
| 2 | One sign-in (Entra ID); permissions are enforced where the record lives | Decided | 2026-10-20 |
| 3 | Documents live in RedSky storage; SharePoint stays the deal-system home | Decided | 2026-10-20 |
| 4 | Services talk over versioned HTTP APIs and signed events, never shared queues | Decided | 2026-10-20 |
| 5 | Two repositories: `redsky-core` for the platform, `redsky-twenty` for the CRM | Decided | 2026-10-20 |
| 6 | OCRmyPDF (searchable-PDF copies) | Open: waits on the AGPL position | |
| 7 | How the RedSky API reads Twenty as the signed-in user | Resolved by 16 | 2026-10-21 |
| 8 | Document OCR as a private RedSky service (`redsky-ocr`) | Proposed: built, not deployed | 2026-10-20 |
| 9 | RedSky is the only staff-facing application | Decided | 2026-10-20 |
| 10 | The CRM reaches staff only after the write path and record pages | Decided | 2026-10-20 |
| 11 | Market and research data is enrichment; adding to the CRM is explicit | Proposed | |
| 12 | Production address is `redsky.rsmcapital.com` | Decided | 2026-10-20 |
| 13 | Each RedSky service's secrets are its own service variables | Decided | 2026-10-20 |
| 14 | No Redis until a feature needs one | Decided | 2026-10-20 |
| 15 | Twenty is RedSky's CRM back end, deals included | Decided | 2026-10-21 |
| 16 | RedSky reads and writes Twenty as each person through Twenty's OAuth | Decided; on trial in staging | 2026-10-21 |

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

**Note (2026-10-21).** The order of areas ("Documents first, then Deals") is superseded by decision 15: deals are built in Twenty, which stays the CRM back end. The rule of one owner per record type, and the steps for moving an area, still apply.
- Why Twenty keeps CRM records for now: it already provides the CRM data model with RSM's custom objects, Microsoft 365 email and calendar sync, and a data-admin UI. Staff still work only in RedSky (decision 9). Twenty holds no real client data until the Enterprise-free build exists (`redsky-twenty` decision 1) and RedSky reads it per user (decision 7).

## 2. One sign-in (Entra ID); permissions are enforced where the record lives

**Decision:**
- Microsoft Entra ID is the single sign-in for RedSky and Twenty: RedSky through its own OIDC client, Twenty through its Microsoft sign-in (not Twenty's Enterprise SSO).
- When the RedSky API reads Twenty data, it acts as the signed-in user, so Twenty's own permissions and deal walls apply.
- RedSky's own records are authorized in the RedSky API (`src/server/security/access-policy.ts`), the single place for RedSky permissions. Services behind the API, such as `redsky-ocr`, trust the API's decision and keep no permission model of their own.
- Never use an all-access Twenty key while re-implementing Twenty's permissions in RedSky.

**Why.** Two permission models for the same records disagree sooner or later, and a deal wall that only one of them knows about leaks. Enforcing permissions where a record lives means there is one model per record type, and it moves with the record (decision 1).

**Consequences:**
- The current Twenty adapter (`src/server/integrations/crm/twenty-adapter.ts`) calls Twenty with one shared API key (`TWENTY_API_KEY`). That breaks this rule: every RedSky user sees what the key's role sees. It is acceptable only while Twenty holds no real client data (its deployment is pre-production), and must be replaced before it does. Decision 7.
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
- RedSky's databases are on its own Railway Postgres service, `redsky-postgres`: schema `redsky` for `redsky-web`, database `redsky_ocr` for `redsky-ocr`. Never Twenty's `Postgres`, whose login is an all-access account shared by `twenty-server` and `twenty-worker`, so a shared server would expose RedSky's encrypted Workstyle data to Twenty's credentials. It also keeps RedSky's backups and restores independent of Twenty's upgrades. The web app's migration runner refuses any database containing Twenty's schemas.
- Twenty's service names (`Postgres`, `Redis`, `Bucket`) stay unchanged: Twenty's variables reference them by name.
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

**Resolved (2026-10-21) by decision 16:** Twenty's OAuth authorization server.

**Open.** Decision 2 needs the RedSky API to call Twenty with a token for the signed-in user instead of a shared key. Both sign in through Entra ID, but they hold separate sessions. Options to evaluate against Twenty 2.44: an OAuth flow in which Twenty issues RedSky a token per user, or exchanging the user's Entra token for a Twenty token. Until this is decided, the shared key stays read-only and limited to a pre-production Twenty.

## 8. Document OCR as a private RedSky service (`redsky-ocr`)

**Proposed.** Built and tested in `services/ocr`; not deployed. Supersedes `redsky-twenty` decision 10, which placed it in that repository as a Twenty side service.

**Decision:**
- Extract text, tables and page structure with a Python service: Docling and Tesseract are Python, and OCR is heavy compute that should not run in the web process.
- Self-hosted and CPU-only: IBM Docling (layout and TableFormer models) and Tesseract. No outside OCR or AI service sees document content, and there are no per-page fees.
- No Chinese-developed OCR engines or models. RapidOCR/PaddleOCR, EasyOCR, Qwen utilities and model hubs such as ModelScope are refused at start-up by a dependency policy check. Granite Docling (IBM) is the only optional vision-language model, off by default.
- It follows decisions 2 to 4: private, called by the RedSky API with a service token naming the tenant and user, reading originals from sources, keeping derived data in its own `redsky_ocr` database on `redsky-postgres`, and sending signed events.

**Open points:**
1. Approve deploying it (`docs/DEPLOYMENT.md` §13, stage 1: files uploaded in RedSky, no Twenty changes), and later the Twenty-side changes for the attachment source (stage 2, with per-user access): one SSRF allow-list entry, a read-only role and API key, a webhook.
2. Confirm the provenance and licence of IBM's `docling-layout-heron` model on its model card (RT-DETRv2 architecture, first published by Baidu researchers; the weights are IBM's). The build environment could not reach Hugging Face to check.
3. Whether `_NOAI` should also block plain OCR, as implemented, or only AI use of its output.

## 9. RedSky is the only staff-facing application

**Decision.** Staff do all their work in RedSky, CRM work included, whichever system owns the record (decision 1). Twenty's screens are for one or two administrators: imports, bulk clean-up, data-model changes, mailbox-sync setup. Recorded in `redsky-twenty` as its decision 11.

**Why.** One place to work; no switching between two products that look different and are both called "RedSky".

**Consequences:**
- **Staff stay Twenty workspace members.** They don't work in Twenty's screens, but Twenty's permissions apply to them through RedSky (decision 2), so each person needs a workspace member. Whether Twenty's Entra app is also limited to administrators depends on decision 7: an OAuth flow needs each person to sign in to Twenty once; a token exchange doesn't. Decision 16 chose OAuth, so Twenty's sign-in stays open to staff.
- **Links and emails open RedSky.** Turn off Twenty's user-facing emails, except those administrators need.
- **Rename Twenty's branding** from "RedSky" to an admin name such as "RSM CRM Admin". This is a code change in `redsky-twenty`, still to do.
- **RedSky must cover the daily work** before staff get the CRM (decision 10): writing, editable record pages with timelines, connecting mailboxes. Deals are built in RedSky as the next area to move (decision 1). The roadmap is in [`CRM_INTEGRATION.md`](CRM_INTEGRATION.md).

## 10. The CRM reaches staff only after the write path and record pages

**Decision.** Twenty may be connected read-only at any time, against pre-production data. CRM features are rolled out to staff only once RedSky can create and edit records and show the timeline ([`CRM_INTEGRATION.md`](CRM_INTEGRATION.md) roadmap steps 2 and 3). Writing needs per-user access first (decision 7): the shared key stays read-only.

**Why.** A read-only CRM forces people into Twenty to fix anything, which is the two-system experience decision 9 rules out.

## 11. Market and research data is enrichment; adding to the CRM is explicit

**Proposed.**
- Harmonic, PitchBook and AlphaSense data is displayed and cached in RedSky, labelled with source and date, and not copied wholesale into the CRM.
- A vendor-sourced company becomes a CRM record only through an explicit "Add to CRM", which records the source. While Twenty owns companies, that write goes through Twenty's API as the signed-in user (decision 2).

**Why:**
- **Data quality.** Automatic copying fills the CRM with records nobody chose.
- **Licensing.** Vendors such as PitchBook often restrict storing their data or sending it to AI models. Check each vendor's terms before building its adapter.

## 12. Production address is `redsky.rsmcapital.com`

**Decision.**
- The address is a Railway custom domain on `redsky-web`, with a `CNAME` and a `_railway-verify` `TXT` record added by hand in Cloudflare, set to **DNS only**.
- `REDSKY_APP_URL=https://redsky.rsmcapital.com`.
- The Entra redirect URI is `https://redsky.rsmcapital.com/api/auth/entra/callback`.

**Why:**
- **Manual records** avoid giving Railway ongoing edit access to the `rsmcapital.com` zone, which also carries company email records.
- **DNS only** lets Railway issue the certificate, without changing Cloudflare's zone-wide SSL mode.

**Consequences.** Requests that save data are accepted only from `redsky.rsmcapital.com`. The Railway-generated domain is useful only for health checks, and can be removed. Other RedSky services get no public domain (decision 4).

## 13. Each RedSky service's secrets are its own service variables

**Decision.** Secrets are service variables on the RedSky service that uses them, not project-wide Shared Variables: Entra values, the session secret and the encryption key on `redsky-web`; database password, Twenty key and webhook secret on `redsky-ocr`. A secret two services need, such as the `redsky-ocr` service token and events secret, is set on both. Seal them where the plan allows, and keep the originals in RSM's password manager.

**Why.** Shared Variables are visible to every service in the project, including Twenty's, and no other service needs these values.

## 14. No Redis until a feature needs one

**Decision.** RedSky runs on `redsky-web` and `redsky-postgres`, plus `redsky-ocr` and the `redsky-documents` bucket once Documents is deployed (decisions 3 and 8). Sessions are in Postgres, profile photos are small and stored in Postgres, Workstyle PDFs aren't kept by default, and `redsky-ocr` queues its jobs in a Postgres table (decision 4).

**Revisit when:**
- running more than one `redsky-web` replica, which needs shared rate limits;
- adding connector syncs, which get a sync worker ([`ARCHITECTURE.md`](ARCHITECTURE.md), Services).

Any of these gets its own `redsky-*` service, never Twenty's, and no queue is shared between services (decision 4).

## 15. Twenty is RedSky's CRM back end, deals included

**Decision.** The `redsky-twenty` deployment owns RSM's CRM records (people, organizations, affiliations, interactions, introductions and deals), and RedSky is the only application staff use for them (decision 9). Deals are built as `rsm-core`'s `deal` object in Twenty, not in RedSky. Supersedes the order of areas in decision 1.

**Why:**
- **A clean start.** Twenty holds no real data and no one uses it yet, so it can start as the baseline CRM.
- **What Twenty already provides:** a data model RSM has designed for (`redsky-twenty` `RSM_ARCHITECTURE.md` §6), APIs, Microsoft 365 email and calendar sync, and an admin back office.
- **Per-person access is possible without changing Twenty** (decision 16).

**Consequences:**
- **Real data waits on two things:** the Enterprise-free Twenty build (`redsky-twenty` decision 1), and RSM's replacement for Twenty's Enterprise record sharing (deal walls, `ENTERPRISE_COMPONENTS.md` §5.1). Until then Twenty holds test data only.
- **RedSky uses only Twenty's API, webhooks and SDKs; it never copies Twenty's source.** Twenty's licence lets an application that only talks to those interfaces keep its own licence (the "Twenty Application Exception" in Twenty's `LICENSE`); copying Twenty's AGPL code into `redsky-core` would lose that. Twenty's MIT packages (`twenty-client-sdk`, `twenty-shared`) may be used, keeping their notices.
- **Twenty → RedSky is notification, not data.** Twenty's webhooks are delivered at most once (no retries), so RedSky uses them to refresh and notify, with a periodic catch-up, and keeps no copy of CRM records (decision 1).
- **Staff touch Twenty once, at setup:** to approve RedSky (decision 16) and to connect their Outlook mailbox, which Twenty only lets a person start from their own Twenty session.
- **Moving areas out of Twenty stays possible** through the steps in decision 1. Every Twenty-specific investment makes a move bigger.

## 16. RedSky reads and writes Twenty as each person through Twenty's OAuth

**Decision.** RedSky is registered in Twenty as a confidential OAuth client. Each person approves RedSky once on Twenty's consent page; RedSky then calls Twenty's API with that person's own token (authorization code with PKCE and client secret; access tokens last 30 minutes, refresh tokens 60 days from last use). Resolves decision 7.

**Why.**
- **It is the only built-in way** for an external application to act as a person in Twenty. Tokens carry the person and the application, Twenty applies the person's role on every request, and records the person as author (`createdBy`, timeline, audit).
- **It needs no change to Twenty, and no Enterprise code.** Exchanging the person's Microsoft sign-in token for a Twenty token, the alternative, does not exist in Twenty and would be security-critical custom code in its core.

**Consequences:**
- **One approval per person.** Each person signs in to Twenty with Microsoft, plus Twenty's own two-factor code while RSM enforces it, and approves RedSky. They approve again only if RedSky goes unused for 60 days, or the approval is revoked.
- **Tokens.** RedSky stores them encrypted with `REDSKY_ENCRYPTION_KEY`, bound to the person (`crm_connections`). Disconnecting revokes the grant in Twenty and deletes them. Twenty's refresh tokens are not single-use, so a leaked one stays valid until revoked: they never leave RedSky's server.
- **No shared key alongside OAuth.** With OAuth configured, `TWENTY_API_KEY` is ignored; someone who has not connected is asked to connect.
- **Writing becomes possible** (roadmap step 2), because changes are attributed to the person who made them.

**Open:**
1. Whether to keep Twenty's own two-factor code or rely on Microsoft's MFA, which already guards the Microsoft sign-in to Twenty.
2. Whether signing in from Twenty's consent page returns the person to it. This is to be checked in the staging trial; the code suggests it does.
3. Twenty's open OAuth client registration (`/oauth/register`) is unauthenticated and only rate-limited. Close it if Claude or MCP clients don't need it.
