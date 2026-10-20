# CRM integration: RedSky in front, Twenty behind

Decided 2026-10-20 (see [`DECISIONS.md`](DECISIONS.md) 2–5). This page is the plan; update it as each step lands.

## The decision

- **One system for employees.** RSM staff use RedSky for all day-to-day CRM work: finding, adding and editing people and companies, notes, meetings, history, deals and tasks. They never need to open Twenty.
- **Twenty is the back end.** The rsm-crm Twenty deployment is the **system of record** for CRM records: people, companies, affiliations, interactions, introductions, deals. RedSky reads and writes them through Twenty's API.
- **Twenty's own screens are for administrators only.** One or two people use them for imports, bulk clean-up, data-model changes and the mailbox sync setup, until RedSky covers those too.
- **One system of record per kind of record.** RedSky never keeps a second copy of a CRM record. RedSky-native data (profiles, preferences, layouts, onboarding, Workstyle, tasks, AI conversations, audit log) lives only in `redsky-postgres`.

Why Twenty rather than RedSky-native tables, for now:
- **It's already built:** a full CRM data model with RSM's custom objects designed (`rsm-crm/RSM_ARCHITECTURE.md` §6).
- **It does the hard sync work:** Microsoft 365 email and calendar sync fills the timelines that RedSky's relationship and meeting features need.
- **It provides the back office:** a data-admin UI and APIs.

The adapter boundary keeps the exit open (see "Leaving Twenty later").

## Where each task happens

| What someone does | Where | Status |
|---|---|---|
| Find a person or company | RedSky: ⌘K search, People, record preview | Built, read-only. Off until Twenty is connected |
| Add a contact or company, log a meeting, add a note | RedSky (quick create, record pages), saved to Twenty | Step 2 |
| Edit a record's details | RedSky record page | Step 3. Today's preview is a read-only drawer |
| Email and meeting history with someone | RedSky record timeline, filled by Twenty's email/calendar sync | Step 3 |
| Connect their Outlook mailbox | RedSky onboarding step 5 (Connect) | Step 4 |
| Deals and pipeline | RedSky Pipeline, on the `deal` object in Twenty | Step 5 (Phase 3) |
| Tasks | RedSky My Tasks only | Built. Twenty's task list is never shown to staff |
| Imports, bulk clean-up, new fields, data-model changes | Twenty, administrators only | Exists |

## Roadmap

| Step | Delivers | Done when |
|---|---|---|
| 1. Connect read-only | People list, search and previews from Twenty | `TWENTY_API_URL` and `TWENTY_API_KEY` set on staging data ([`DEPLOYMENT.md`](DEPLOYMENT.md) step 10) |
| 2. Write path | Create and edit people and companies, add notes, log interactions | Writes go through the confirmation dialog, a server-side authorization check, duplicate checks and RedSky's audit log, against a staging Twenty first |
| 3. Record pages and timeline | Full, editable record pages with the email/meeting timeline from Twenty | An employee can do day-to-day CRM work without opening Twenty |
| 4. Mailbox connection | Staff connect Outlook from RedSky's Connect step, or IT enables an organization-wide sync | No employee visits Twenty's settings |
| 5. Deals | Pipeline and deal records on Twenty's `deal` object (replacing Opportunity) | Matches the rsm-crm deal model |

**Rollout rule.** Twenty can be connected read-only (step 1) at any time. Don't roll the CRM out to staff until steps 2 and 3 are done. Otherwise people would have to open Twenty to change anything, which is the two-system experience this plan avoids.

## Design rules

### Writes (step 2)
- **Same path as other changes.** Every create or update is a structured action that goes through RedSky's confirmation step and `/api/actions/confirm`. The server re-derives the action, authorizes it, makes it idempotent and records it in `audit_events`. The same applies to AI-proposed actions.
- **Duplicate checks.** Before creating a record, match people by email and companies by website domain. Show the possible match instead of creating a second record.
- **Map to rsm-crm's fields.** Map to the person and company fields RSM actually uses, including the rsm-core custom fields. Treat missing fields as optional, as the read adapter already does.
- **Attribution.** With a single workspace API key, Twenty records the key as the author of every change. RedSky's audit log records the real person. Crediting the person inside Twenty needs per-person access (next section).

### Who sees what
- **The gap.** A Twenty API key covers the whole workspace. With one key, every signed-in RedSky user sees everything that key can see, whatever their own Twenty permissions.
- **Acceptable for now.** That is fine while Twenty holds only staging or test data, which is its status today: the stock build includes Enterprise-licensed code, so it holds no real client, deal or investor data until the Enterprise-free build exists (rsm-crm decision 1).
- **Required before real data.** Before real, sensitive records go in (deal walls, restricted contacts), add per-person access:
  - either match each RedSky user to their Twenty workspace member and pass their permissions through,
  - or enforce record classifications in RedSky. Its access policy already has `restricted` and team-membership checks, so it fails closed.

### Keeping staff out of Twenty
- **Entra.** Assign Twenty's app registration to administrators only.
- **Links and emails.** Every link staff receive (notifications, digests, shared records) opens RedSky. Turn off Twenty's user-facing emails, except those administrators need.
- **Branding.** The Twenty deployment is currently branded "RedSky" (rsm-crm, 2026-10-16). Rename its branding to an admin name such as **"RSM CRM Admin"**, so the few people who open it know which system they are in. This is a code change in rsm-crm, still to do.

## Market and research data (Harmonic, PitchBook, AlphaSense)

- **Enrichment only.** Vendor data is displayed and cached in RedSky, on company records, the Intelligence Feed, meeting prep and AI answers with citations. It is not copied into Twenty wholesale.
- **Explicit "Add to CRM".** A company found in Harmonic becomes a CRM record only when someone chooses to add it. The record keeps its source and date.
- **Licence first.** Before building each adapter, check the vendor's terms on:
  - storing its data,
  - showing it to people without a seat,
  - sending it to an AI model.

  PitchBook is "licensing under review" in the connector catalog.
- **Shape.** One adapter per vendor (`src/server/integrations/<vendor>/`) behind a shared market-intelligence interface, with normalized models (company signals, transactions, research items). Companies are matched to CRM records by website domain.
- **Credentials.**
  - **Firm keys** are `redsky-web` service variables.
  - **Per-seat logins** (likely AlphaSense) are stored per person, encrypted like Workstyle data, and the provider is shown only to seat holders.

## Leaving Twenty later

RedSky never connects to Twenty's database. If RSM retires Twenty:

1. **Build each area natively in RedSky.** Behind the same CRM adapter interface, each area moves to tables in `redsky-postgres`. The screens don't change.
2. **Copy data through Twenty's API, not its database.** Keep an old-to-new ID map. Copy files from Twenty's Bucket.
3. **Switch one area at a time:** make it read-only in Twenty, do a final catch-up copy, then point RedSky at its own tables.
4. **Shut down in order:** `twenty-worker` (stops syncing), then `twenty-server`, then `Redis`.
5. **Archive, then delete `Postgres` and `Bucket` last.** Take a final dump and copy the files, prove the archive restores, and keep it as long as RSM's retention rules require.

Every Twenty-specific investment made from now on (custom objects, workflows, its audit log) makes this bigger, so weigh the direction before customizing Twenty heavily.

## Open questions

| Question | Owner | Blocks |
|---|---|---|
| Does the rsm-crm fork support an organization-wide mailbox sync, or only per-person connection from Twenty's settings? | Engineering | Step 4 |
| Per-person access: match users to Twenty workspace members, or classify records in RedSky? | Engineering + compliance | Real data |
| Enterprise-free Twenty build (rsm-crm decision 1) | Engineering + counsel | Real data in Twenty |
| Which Twenty fields RSM uses for people and companies, and which are required | Operations | Step 2 |
