# Decision record

Decisions that shape RedSky. Add new ones at the end, and don't rewrite a settled decision: supersede it with a new entry. rsm-crm keeps its own record in `rsm-crm/rsm/docs/DECISIONS.md`; decisions that affect both are noted in both.

| # | Decision | Status | Date |
|---|---|---|---|
| 1 | RedSky has its own database | Decided | 2026-10-20 |
| 2 | Twenty is the system of record for CRM records, for now | Decided | 2026-10-20 |
| 3 | RedSky is the only staff-facing application | Decided | 2026-10-20 |
| 4 | The CRM reaches staff only after the write path and record pages | Decided | 2026-10-20 |
| 5 | Market and research data is enrichment; adding to the CRM is explicit | Proposed | |
| 6 | Production address is `redsky.rsmcapital.com` | Decided | 2026-10-20 |
| 7 | RedSky's secrets are `redsky-web` service variables | Decided | 2026-10-20 |
| 8 | No Redis or Bucket until a feature needs one | Decided | 2026-10-20 |

## 1. RedSky has its own database

**Decision.** RedSky stores its data in its own Railway Postgres service, `redsky-postgres`, inside the `redsky` schema. It never connects to Twenty's `Postgres`.

**Why:**
- **Workstyle privacy.** Twenty's database login is an all-access account shared by `twenty-server` and `twenty-worker`, so a shared database would expose RedSky's encrypted Workstyle data to Twenty's credentials.
- **Independence.** Backups, restores and rollbacks stay independent of Twenty's upgrades, which migrate its database on every start.

**Consequences:**
- The migration runner refuses any database containing Twenty's schemas.
- Twenty's service names (`Postgres`, `Redis`, `Bucket`) stay unchanged, because Twenty's variables reference them by name (`rsm-crm/rsm/deploy/railway/README.md`).

## 2. Twenty is the system of record for CRM records, for now

**Decision.** People, companies, affiliations, interactions, introductions and deals live in the rsm-crm Twenty deployment. RedSky reads and writes them through Twenty's API and keeps no second copy. RedSky-native data stays in `redsky-postgres`.

**Why.** Twenty already provides:
- the CRM data model, including RSM's custom objects;
- Microsoft 365 email and calendar sync;
- a data-admin UI and APIs.

Building those in RedSky first would delay everything else.

**Consequences:**
- **Not for real data yet.** Real data waits on the Enterprise-free Twenty build (rsm-crm decision 1) and on per-person access in RedSky ([`CRM_INTEGRATION.md`](CRM_INTEGRATION.md), "Who sees what").
- **Revisit.** Review the decision once it's clear how much anyone uses Twenty's own screens. The exit path is in [`CRM_INTEGRATION.md`](CRM_INTEGRATION.md).

## 3. RedSky is the only staff-facing application

**Decision.** Staff do all day-to-day CRM work in RedSky. Twenty's screens are for one or two administrators: imports, bulk clean-up, data-model changes, mailbox-sync setup.

**Why.** One place to work; no switching between two products that look different and are both called "RedSky".

**Consequences:**
- **Restrict Twenty's sign-in.** Assign Twenty's Entra app to administrators only.
- **Links and emails open RedSky.** Turn off Twenty's user-facing emails, except those administrators need.
- **Rename Twenty's branding** from "RedSky" to an admin name such as "RSM CRM Admin". This is a code change in rsm-crm, still to do.
- **RedSky must cover the daily work:** writing, editable record pages with timelines, connecting mailboxes and deals ([`CRM_INTEGRATION.md`](CRM_INTEGRATION.md) roadmap).

## 4. The CRM reaches staff only after the write path and record pages

**Decision.** Twenty may be connected read-only at any time. CRM features are rolled out to staff only once RedSky can create and edit records and show the timeline (roadmap steps 2 and 3).

**Why.** A read-only CRM forces people into Twenty to fix anything, which is the two-system experience decision 3 rules out.

## 5. Market and research data is enrichment; adding to the CRM is explicit

**Proposed.**
- Harmonic, PitchBook and AlphaSense data is displayed and cached in RedSky, labelled with source and date, and not copied wholesale into the CRM.
- A vendor-sourced company becomes a CRM record only through an explicit "Add to CRM", which records the source.

**Why:**
- **Data quality.** Automatic copying fills the CRM with records nobody chose.
- **Licensing.** Vendors such as PitchBook often restrict storing their data or sending it to AI models. Check each vendor's terms before building its adapter.

## 6. Production address is `redsky.rsmcapital.com`

**Decision.**
- The address is a Railway custom domain, with a `CNAME` and a `_railway-verify` `TXT` record added by hand in Cloudflare, set to **DNS only**.
- `REDSKY_APP_URL=https://redsky.rsmcapital.com`.
- The Entra redirect URI is `https://redsky.rsmcapital.com/api/auth/entra/callback`.

**Why:**
- **Manual records** avoid giving Railway ongoing edit access to the `rsmcapital.com` zone, which also carries company email records.
- **DNS only** lets Railway issue the certificate, without changing Cloudflare's zone-wide SSL mode.

**Consequences.** Requests that save data are accepted only from `redsky.rsmcapital.com`. The Railway-generated domain is useful only for health checks, and can be removed.

## 7. RedSky's secrets are `redsky-web` service variables

**Decision.** Entra values, the session secret and the encryption key are service variables on `redsky-web`, not project-wide Shared Variables. Seal them where the plan allows, and keep the originals in RSM's password manager.

**Why.** Shared Variables are visible to every service in the project, including Twenty's, and nothing else needs these values.

## 8. No Redis or Bucket until a feature needs one

**Decision.** RedSky runs with `redsky-web` and `redsky-postgres` only. Sessions are in Postgres, profile photos are small and stored in Postgres, and Workstyle PDFs aren't kept by default.

**Revisit when:**
- running more than one `redsky-web` replica, which needs shared rate limits (Redis);
- adding background jobs such as connector syncs (Redis plus a worker);
- adding real document uploads (a Bucket).

Any of these gets its own `redsky-*` service, never Twenty's.
