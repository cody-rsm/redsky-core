# CRM integration: RedSky in front, Twenty behind

Decided 2026-10-20 (see [`DECISIONS.md`](DECISIONS.md) 1, 2 and 9 to 11; 7 is open). This page is the plan; update it as each step lands.

## The decision

- **One system for employees.** RSM staff use RedSky for all their work: finding, adding and editing people and companies, notes, meetings, history, deals, documents and tasks. They never need to open Twenty (decision 9).
- **Twenty is the back end, for now.** The `redsky-twenty` deployment owns CRM records (people, companies, affiliations, interactions, introductions, opportunities) until each area moves to RedSky (decision 1). While it owns them, RedSky reads and writes them through Twenty's API **as the signed-in user**, so Twenty's permissions and deal walls apply (decision 2).
- **Areas move to RedSky one at a time.** Documents first (built), then Deals, then the rest. Each move changes the owner; Twenty is retired when the last area has moved.
- **Twenty's own screens are for administrators only.** One or two people use them for imports, bulk clean-up, data-model changes and the mailbox sync setup, until RedSky covers those too.
- **One owner per record type.** RedSky never keeps a second writable copy of a Twenty record, and there is no two-way sync. RedSky-native data (profiles, preferences, layouts, onboarding, Workstyle, tasks, AI conversations, documents, audit log) lives only in RedSky.

Why Twenty keeps CRM records for now:
- **It's already built:** a full CRM data model with RSM's custom objects designed (`redsky-twenty/RSM_ARCHITECTURE.md` §6).
- **It does the hard sync work:** Microsoft 365 email and calendar sync fills the timelines that RedSky's relationship and meeting features need.
- **It provides the back office:** a data-admin UI and APIs.

The adapter boundary keeps each move small (see "Moving an area out of Twenty").

## Where each task happens

| What someone does | Where | Status |
|---|---|---|
| Find a person or company | RedSky: ⌘K search, People, record preview | Built, read-only. Off until Twenty is connected |
| Add a contact or company, log a meeting, add a note | RedSky (quick create, record pages), saved to Twenty as the user | Step 2 |
| Edit a record's details | RedSky record page | Step 3. Today's preview is a read-only drawer |
| Email and meeting history with someone | RedSky record timeline, filled by Twenty's email/calendar sync | Step 3 |
| Connect their Outlook mailbox | RedSky onboarding step 5 (Connect) | Step 4 |
| Upload, read and search documents | RedSky Documents (`redsky-documents` bucket, `redsky-ocr`) | Built, not deployed ([`DEPLOYMENT.md`](DEPLOYMENT.md) §13) |
| Deals and pipeline | RedSky Pipeline, on RedSky's own deal records | Step 5, the next area to move |
| Tasks | RedSky My Tasks only | Built. Twenty's task list is never shown to staff |
| Imports, bulk clean-up, new fields, data-model changes | Twenty, administrators only | Exists |

## Roadmap

| Step | Delivers | Done when |
|---|---|---|
| 1. Connect read-only | People list, search and previews from Twenty | `TWENTY_API_URL` and a read-only `TWENTY_API_KEY` set against pre-production data ([`DEPLOYMENT.md`](DEPLOYMENT.md) step 10) |
| 2. Per-user access and write path | RedSky calls Twenty as the signed-in user (decision 7), then creates and edits people and companies, adds notes, logs interactions | The shared key is gone. Writes go through the confirmation dialog, duplicate checks and RedSky's audit log, against a staging Twenty first |
| 3. Record pages and timeline | Full, editable record pages with the email/meeting timeline from Twenty | An employee can do day-to-day CRM work without opening Twenty |
| 4. Mailbox connection | Staff connect Outlook from RedSky's Connect step, or IT enables an organization-wide sync | No employee visits Twenty's settings |
| 5. Deals move to RedSky | Pipeline and deal records owned by RedSky, aligned with the RSM Deal System (`YY-##` numbers); Twenty's opportunities migrated, then read-only there | Follows "Moving an area out of Twenty" |

**Rollout rule** (decision 10). Twenty can be connected read-only (step 1) at any time, against pre-production data. Don't roll the CRM out to staff until steps 2 and 3 are done. Otherwise people would have to open Twenty to change anything, which is the two-system experience this plan avoids.

## Design rules

### Reading and writing as the user (step 2)
- **Per-user, never all-access.** Every call to Twenty carries a token for the signed-in user, so Twenty's roles and deal walls decide what they see and change (decision 2). RedSky never re-implements Twenty's permissions on top of a shared key. How RedSky gets that token is decision 7 (an OAuth flow in which Twenty issues a token per user, or exchanging the user's Entra token).
- **The shared key is a stopgap.** Until decision 7 is built, `TWENTY_API_KEY` is read-only, on a dedicated read-only role, and only against pre-production data: every signed-in user sees what that role sees.
- **Attribution.** Because writes run as the user, Twenty credits the person. RedSky's audit log records them too.

### Writes
- **Same path as other changes.** Every create or update is a structured action that goes through RedSky's confirmation step and `/api/actions/confirm`. The server re-derives the action, makes it idempotent and records it in `audit_events`; Twenty authorizes it. The same applies to AI-proposed actions.
- **Duplicate checks.** Before creating a record, match people by email and companies by website domain. Show the possible match instead of creating a second record.
- **Map to `redsky-twenty`'s fields.** Map to the person and company fields RSM actually uses, including the `rsm-core` custom fields. Treat missing fields as optional, as the read adapter already does.
- **No copies.** RedSky stores links to Twenty records as `{system, object, id}` (for example `twenty/company/<uuid>`), never their contents.

### Keeping staff out of Twenty
- **Workspace members, not users of its screens.** Each staff member is a Twenty workspace member, because Twenty's permissions apply to them through RedSky. Whether Twenty's Entra app is also limited to administrators depends on decision 7: an OAuth flow needs each person to sign in to Twenty once; a token exchange doesn't.
- **Links and emails.** Every link staff receive (notifications, digests, shared records) opens RedSky. Turn off Twenty's user-facing emails, except those administrators need.
- **Branding.** The Twenty deployment is currently branded "RedSky" (2026-10-16). Rename its branding to an admin name such as **"RSM CRM Admin"**, so the few people who open it know which system they are in. This is a code change in `redsky-twenty`, still to do.

### Documents on CRM records
- **Files uploaded in RedSky** live in the `redsky-documents` bucket, with their text in `redsky-ocr`'s database (decision 3). Linking them to a company or deal uses `{system, object, id}` links; access comes from RedSky's own sharing setting, never from the link.
- **Files attached in Twenty** can be extracted by `redsky-ocr`'s Twenty source, but RedSky doesn't list them yet. Before it does, it must check each one as the signed-in user against Twenty (decision 2). Turn that source on with step 2, not before ([`DEPLOYMENT.md`](DEPLOYMENT.md) §13).

## Market and research data (Harmonic, PitchBook, AlphaSense)

Proposed (decision 11).

- **Enrichment only.** Vendor data is displayed and cached in RedSky, on company records, the Intelligence Feed, meeting prep and AI answers with citations. It is not copied into Twenty wholesale.
- **Explicit "Add to CRM".** A company found in Harmonic becomes a CRM record only when someone chooses to add it, as the signed-in user. The record keeps its source and date.
- **Licence first.** Before building each adapter, check the vendor's terms on:
  - storing its data,
  - showing it to people without a seat,
  - sending it to an AI model.

  PitchBook is "licensing under review" in the connector catalog.
- **Shape.** One adapter per vendor (`src/server/integrations/<vendor>/`) behind a shared market-intelligence interface, with normalized models (company signals, transactions, research items). Companies are matched to CRM records by website domain. Scheduled refreshes get a sync worker when the first connector needs one ([`ARCHITECTURE.md`](ARCHITECTURE.md), Services).
- **Credentials.**
  - **Firm keys** are service variables on the RedSky service that uses them (decision 13).
  - **Per-seat logins** (likely AlphaSense) are stored per person, encrypted like Workstyle data, and the provider is shown only to seat holders.

## Moving an area out of Twenty

RedSky never connects to Twenty's database. Each area moves the same way (decision 1):

1. **Build the area in RedSky** behind the RedSky API, in RedSky's own tables. The screens don't change, because the UI uses normalized types, not Twenty shapes.
2. **Migrate its records through Twenty's API**, not its database. Keep an old-to-new ID map and rewrite `{system, object, id}` links.
3. **Switch writes to RedSky.**
4. **Make Twenty read-only for that area**, do a final catch-up copy, then remove the area there.

Documents moved first (files uploaded in RedSky never go to Twenty). Deals are next (roadmap step 5). When the last area has moved:

1. **Shut down in order:** `twenty-worker` (stops syncing), then `twenty-server`, then `Redis`.
2. **Archive, then delete `Postgres` and `Bucket` last.** Take a final dump and copy the files, prove the archive restores, and keep it as long as RSM's retention rules require.

Every Twenty-specific investment made from now on (custom objects, workflows, its audit log) makes the remaining moves bigger, so weigh the direction before customizing Twenty heavily.

## Open questions

| Question | Owner | Blocks |
|---|---|---|
| How RedSky calls Twenty as the signed-in user: OAuth flow or Entra token exchange (decision 7) | Engineering | Step 2, real data |
| Does the `redsky-twenty` fork support an organization-wide mailbox sync, or only per-person connection from Twenty's settings? | Engineering | Step 4 |
| Enterprise-free Twenty build (`redsky-twenty` decision 1) | Engineering + counsel | Real data in Twenty |
| Which Twenty fields RSM uses for people and companies, and which are required | Operations | Step 2 |
| The deal model in RedSky, from `redsky-twenty`'s `RSM_ARCHITECTURE.md` §6 and the RSM Deal System | Investment team + engineering | Step 5 |
