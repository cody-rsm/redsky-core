# CRM integration: RedSky in front, Twenty behind

Decided 2026-10-20 and 2026-10-21 (see [`DECISIONS.md`](DECISIONS.md) 1, 2, 9 to 11, 15 and 16). This page is the plan; update it as each step lands.

## The decision

- **One system for employees.** RSM staff use RedSky for all their work: finding, adding and editing people and companies, notes, meetings, history, deals, documents and tasks (decision 9).
- **Twenty is the CRM back end, deals included.** The `redsky-twenty` deployment owns CRM records: people, organizations, affiliations, interactions, introductions and, once built, deals as `rsm-core`'s `deal` object (decision 15). RedSky-native data (profiles, preferences, layouts, onboarding, Workstyle, tasks, AI conversations, documents, audit log) lives only in RedSky.
- **RedSky acts in Twenty as each person.** Each person approves RedSky once through Twenty's OAuth; RedSky then reads and writes with that person's token, so Twenty's roles and deal walls apply and Twenty records them as the author (decisions 2 and 16).
- **Twenty's own screens are for administrators.** One or two people use them for imports, bulk clean-up and data-model changes. Staff open Twenty only once, at setup: to approve RedSky and to connect their Outlook mailbox.
- **One owner per record type, no two-way sync.** RedSky keeps no copy of a Twenty record. Twenty tells RedSky about changes through webhooks; RedSky reads the record from Twenty when it shows it.

Why Twenty:
- **It's already built:** a full CRM data model with RSM's objects designed (`redsky-twenty/RSM_ARCHITECTURE.md` §6).
- **It does the hard sync work:** Microsoft 365 email and calendar sync fills the timelines that RedSky's relationship and meeting features need.
- **It provides the back office:** a data-admin UI and APIs.
- **RedSky stays its own product.** It uses only Twenty's API, webhooks and SDKs, which Twenty's licence allows without bringing RedSky under the AGPL (decision 15).

## Where each task happens

| What someone does | Where | Status |
|---|---|---|
| Connect RedSky to the CRM (once) | RedSky People or Settings › Connected apps, approving on Twenty's consent page | Built; staging trial next (step 1) |
| Find a person or company | RedSky: ⌘K search, People, record preview | Built, read-only, as each person |
| Add a contact or company, log a meeting, add a note | RedSky (quick create, record pages), saved to Twenty as the person | Step 2 |
| Edit a record's details | RedSky record page | Step 3. Today's preview is a read-only drawer |
| Email and meeting history with someone | RedSky record timeline, filled by Twenty's email/calendar sync | Step 3 |
| Connect their Outlook mailbox | Twenty, once, at setup: Twenty only starts it from the person's own Twenty session, and has no organization-wide sync | Step 4 |
| Upload, read and search documents | RedSky Documents (`redsky-documents` bucket, `redsky-ocr`) | Deployed (stage 1) |
| Deals and pipeline | RedSky Pipeline, on `rsm-core`'s `deal` object in Twenty | Step 5 |
| Tasks | RedSky My Tasks only | Built. Twenty's task list is never shown to staff |
| Imports, bulk clean-up, new fields, data-model changes | Twenty, administrators only | Exists |

## Roadmap

| Step | Delivers | Done when |
|---|---|---|
| 1. Per-person connection | Each person connects once; People, search and previews read Twenty as them | RedSky is registered in Twenty and the trial on staging passes ([`DEPLOYMENT.md`](DEPLOYMENT.md) §10): permissions differ by role, disconnect revokes. `rsm-core` installed on the staging workspace |
| 2. Write path | Create and edit people and companies, add notes, log interactions, as the person | Writes go through the confirmation dialog, duplicate checks and RedSky's audit log, against a staging Twenty first |
| 3. Record pages, timeline and change notifications | Full, editable record pages with the email/meeting timeline; a webhook receiver for refreshes and notifications | An employee can do day-to-day CRM work without opening Twenty |
| 4. Mailbox connection | A guided setup: approve RedSky and connect Outlook in one sitting | No employee needs Twenty after setup |
| 5. Deals | `rsm-core`'s `deal` object (Phase 2) with RSM's deal walls; Pipeline and deal records in RedSky | Matches the RSM Deal System (`YY-##` numbers, status vocabulary) |

**Rollout rule** (decision 10). Connect on staging data at any time. Don't roll the CRM out to staff until steps 2 and 3 are done. Real data waits on the Enterprise-free Twenty build and RSM's deal walls (decision 15).

## Design rules

### Reading and writing as the person
- **Every call carries the person's own token** (`src/server/integrations/crm/twenty-oauth.ts`), refreshed automatically. Twenty applies their role to every request; RedSky never re-implements Twenty's permissions.
- **Not connected means "connect", never a fallback.** With OAuth configured, the shared `TWENTY_API_KEY` is ignored. A connection Twenty no longer honours (revoked, unused for 60 days, member removed) is deleted, and the person is asked to connect again.
- **Attribution.** Twenty records the person as the author of each change; RedSky's audit log records it too.

### Writes (step 2)
- **Same path as other changes.** Every create or update is a structured action that goes through RedSky's confirmation step and `/api/actions/confirm`. The server re-derives the action, makes it idempotent and records it in `audit_events`; Twenty authorizes it. The same applies to AI-proposed actions.
- **Duplicate checks.** Before creating a record, match people by email and companies by website domain. Show the possible match instead of creating a second record.
- **Map to `redsky-twenty`'s fields.** Map to the person and company fields RSM actually uses, including the `rsm-core` custom fields. Treat missing fields as optional, as the read adapter already does.
- **No copies.** RedSky stores links to Twenty records as `{system, object, id}` (for example `twenty/company/<uuid>`), never their contents.

### Changes from Twenty (step 3)
- **Webhooks are nudges.** Twenty sends a signed webhook for each create, update or delete, with the changed record and who changed it. It tries once, with no retry, so RedSky uses webhooks to refresh what is on screen and to notify people, plus a periodic catch-up, and never as a feed it depends on.
- **Twenty's own limits:** it only sends records everyone may see, and the code that decides that is Enterprise code, which the Enterprise-free build must replace. A private-network target needs `OUTBOUND_HTTP_ALLOWED_INTERNAL_HOSTS` on `twenty-server` and `twenty-worker`, an exact host name.
- **Timelines** are read from Twenty's email and calendar records through the API, where Twenty hides content each person may not see. Twenty's ready-made timeline queries refuse application tokens.

### Keeping staff out of Twenty
- **Sign-in stays open, the screens aren't used.** Approving RedSky needs each person to sign in to Twenty once, so Twenty's Microsoft sign-in stays open to staff (decision 16). After setup, everything happens in RedSky.
- **Links and emails.** Every link staff receive (notifications, digests, shared records) opens RedSky. Turn off Twenty's user-facing emails, except those administrators need.
- **Branding.** The Twenty deployment is currently branded "RedSky" (2026-10-16). Rename its branding to an admin name such as **"RSM CRM Admin"**, so the few people who open it know which system they are in. This is a code change in `redsky-twenty`, still to do.

### Documents on CRM records
- **Files uploaded in RedSky** live in the `redsky-documents` bucket, with their text in `redsky-ocr`'s database (decision 3). Linking them to a company or deal uses `{system, object, id}` links; access comes from RedSky's own sharing setting, never from the link.
- **Files attached in Twenty** can be extracted by `redsky-ocr`'s Twenty source, but RedSky doesn't list them yet. Before it does, it must check each one as the signed-in person against Twenty (decision 2). Turn that source on with step 2, not before ([`DEPLOYMENT.md`](DEPLOYMENT.md) §13).

## Market and research data (Harmonic, PitchBook, AlphaSense)

Proposed (decision 11).

- **Enrichment only.** Vendor data is displayed and cached in RedSky, on company records, the Intelligence Feed, meeting prep and AI answers with citations. It is not copied into Twenty wholesale.
- **Explicit "Add to CRM".** A company found in Harmonic becomes a CRM record only when someone chooses to add it, as that person. The record keeps its source and date.
- **Licence first.** Before building each adapter, check the vendor's terms on:
  - storing its data,
  - showing it to people without a seat,
  - sending it to an AI model.

  PitchBook is "licensing under review" in the connector catalog.
- **Shape.** One adapter per vendor (`src/server/integrations/<vendor>/`) behind a shared market-intelligence interface, with normalized models (company signals, transactions, research items). Companies are matched to CRM records by website domain. Scheduled refreshes get a sync worker when the first connector needs one ([`ARCHITECTURE.md`](ARCHITECTURE.md), Services).
- **Credentials.**
  - **Firm keys** are service variables on the RedSky service that uses them (decision 13).
  - **Per-seat logins** (likely AlphaSense) are stored per person, encrypted like Workstyle data, and the provider is shown only to seat holders.

## Moving an area out of Twenty later

Twenty stays the CRM back end (decision 15), but an area can still move to RedSky if that becomes worth it. RedSky never connects to Twenty's database, so each move follows the same steps (decision 1):

1. **Build the area in RedSky** behind the RedSky API, in RedSky's own tables. The screens don't change, because the UI uses normalized types, not Twenty shapes.
2. **Migrate its records through Twenty's API**, not its database. Keep an old-to-new ID map and rewrite `{system, object, id}` links.
3. **Switch writes to RedSky.**
4. **Make Twenty read-only for that area**, do a final catch-up copy, then remove the area there.

If every area moves, shut down `twenty-worker`, then `twenty-server`, then `Redis`; archive `Postgres` and `Bucket`, prove the archive restores, and keep it as long as RSM's retention rules require. Every Twenty-specific investment makes a move bigger.

## Open questions

| Question | Owner | Blocks |
|---|---|---|
| Keep Twenty's own two-factor code, or rely on Microsoft's MFA for the sign-in to Twenty (decision 16) | Leadership + IT | Staff rollout |
| Does Twenty return a person to its consent page after they sign in from it? (check in the trial) | Engineering | Step 1 |
| Close Twenty's open OAuth client registration if Claude or MCP clients don't need it | Engineering | Real data |
| Enterprise-free Twenty build and RSM's deal walls (`redsky-twenty` decision 1) | Engineering + counsel | Real data in Twenty |
| Which Twenty fields RSM uses for people and companies, and which are required | Operations | Step 2 |
| The `deal` object in `rsm-core`, from `RSM_ARCHITECTURE.md` §6 and the RSM Deal System | Investment team + engineering | Step 5 |
