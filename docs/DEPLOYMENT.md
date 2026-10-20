# Deploying RedSky to Railway

RedSky is added to the **existing** Railway project as two new services:

| New service | Source | Role |
|---|---|---|
| `redsky-web` | GitHub `cody-rsm/redsky-core`, branch `main` (`staging` for a staging environment), root `Dockerfile` | The Next.js app (UI + API). |
| `redsky-postgres` | Railway PostgreSQL | RedSky's own data: profiles, onboarding, preferences, layouts, Workstyle, tasks, AI conversations, audit log. |
| `redsky-ocr` (optional, §13) | Same repository, root directory `services/ocr` | Document OCR and extraction. Private. Its own `redsky_ocr` database on `redsky-postgres`. |
| `redsky-documents` (with §13) | Railway Storage Bucket | Originals uploaded in RedSky's Documents page. `redsky-web` writes them; `redsky-ocr` reads them. |

`twenty-server`, `twenty-worker`, `Postgres`, `Redis` and `Bucket` are **not changed** by any step below. RedSky never connects to Twenty's `Postgres`. It reaches Twenty only through Twenty's REST API (step 10), and only once you add credentials.

> **Approval boundary.** This guide describes actions *you* take in GitHub and Railway. Nothing here was run against Railway by the build process.

> **Repository rename.** The repository was renamed from `cody-rsm/RedSky` to `cody-rsm/redsky-core`, and the Twenty repository from `cody-rsm/rsm-crm` to `cody-rsm/redsky-twenty`. GitHub redirects the old names. On services created before the rename, check **Settings → Source** shows the new name, and reconnect the repository if it does not.

> **Verified locally (Docker):**
> - The image builds.
> - It runs as a non-root user.
> - It listens on `PORT`, and `/api/health` answers.
> - `node dist/migrate.mjs` initializes an empty database, is safe to re-run, and **refuses a database containing Twenty's schemas** (exit code 2).
> - Development sign-in returns 404 in the production image.
>
> **Not verified:** the Railway-specific settings below. Railway was not reachable from the build environment, so they come from Railway's documentation and from `redsky-twenty/rsm/deploy/railway/README.md`.

---

## 1. Inspect the project and prepare the repository

1. Clone `cody-rsm/redsky-core` and confirm the default branch is `main`. GitHub → repository → **Settings → General → Default branch**.
2. Locally, run the checks that CI runs:
   ```bash
   npm ci
   npm run lint && npm run typecheck && npm test && npm run build
   ```
3. Confirm no secrets are tracked:
   ```bash
   git ls-files | grep -E '\.env($|\.)|\.pem$|\.key$|\.pdf$'
   ```
   The only expected match is `.env.example`.
4. Keep the repository **private**. GitHub → **Settings → General → Danger Zone → Change visibility** must show *Private*.

## 2. Commit and push safely

1. Work on a feature branch. Open a pull request into `staging`, then from `staging` into `main`.
2. Protect `main` (and `staging`) at GitHub → **Settings → Branches → Add branch ruleset**:
   - Require a pull request before merging.
   - Require status checks: the `CI` workflow.
   - Block force pushes.
3. Never commit `.env.local` or real values. `.gitignore` already excludes `.env*`, PDFs and keys.

## 3. Add `redsky-web` to the existing project

1. Open the Railway dashboard → the existing project (the one with `twenty-server`) → the environment you are deploying to.
2. Click **+ New → GitHub Repo → `cody-rsm/redsky-core`**. If the repository is missing, grant the Railway GitHub app access to it under **Configure GitHub App**.
3. Rename the new service to `redsky-web`: open the service → **Settings → Service name**.
4. Railway starts a first build immediately. It will fail its health check until steps 4–6 are done. That is harmless: the service has no public domain yet. You can also open **Deployments** and remove the deployment.
5. Under **Settings → Source**:
   - Branch: `main`.
   - Root directory: empty.

## 4. Add `redsky-postgres`

1. **+ New → Database → Add PostgreSQL**. Rename it `redsky-postgres`.
2. Do **not** add public networking to it. Leave **Settings → Networking → Public Networking** off.
3. Confirm the service has a volume. Railway attaches one to its Postgres template.
4. Only `redsky-web` will reference this database (next step). Do not reference `redsky-postgres` from the Twenty services, and do not reference Twenty's `Postgres` from `redsky-web`.

## 5. Set `redsky-web` variables

Open `redsky-web` → **Variables → Raw Editor** and paste the following, then fill the blanks. Generate the secrets on your own machine and store them in RSM's password manager **before** pasting:

```bash
openssl rand -base64 48    # REDSKY_SESSION_SECRET
openssl rand -base64 32    # REDSKY_ENCRYPTION_KEY  (losing it makes stored Workstyle data unreadable)
```

```env
NODE_ENV=production
REDSKY_DATABASE_URL=${{redsky-postgres.DATABASE_URL}}
REDSKY_DATA_MODE=production
REDSKY_APP_URL=https://${{RAILWAY_PUBLIC_DOMAIN}}
REDSKY_TIMEZONE=America/New_York
REDSKY_SESSION_SECRET=
REDSKY_ENCRYPTION_KEY=
AUTH_ENTRA_TENANT_ID=
AUTH_ENTRA_CLIENT_ID=
AUTH_ENTRA_CLIENT_SECRET=
AUTH_ENTRA_ADMIN_ROLE=RedSky.Admin
AI_PROVIDER=none
LOG_LEVEL=info
```

- `REDSKY_DATABASE_URL` uses the **private** URL that Railway's reference variable resolves to. Check the reference shows a resolved value (not red) in the Variables list.
- `REDSKY_APP_URL` must match the domain from step 8. The reference fills in once a domain exists. With a custom domain later, set it explicitly (`https://redsky.example.com`).
- **Entra app registration** (Microsoft Entra admin center → **App registrations → New registration**):
  - Single tenant.
  - Platform **Web**, redirect URI `https://<redsky domain>/api/auth/entra/callback`.
  - Create a client secret.
  - Optionally create an **App role** named `RedSky.Admin` and assign administrators.
  - API permission: Microsoft Graph delegated `User.Read` (used once at sign-in to prefill the profile).
- Until all four auth values (tenant, client ID, secret, session secret) are set, RedSky shows "Sign-in isn't configured" and every API returns 401.
- **Never set** `AUTH_DEV_ENABLED` on Railway. It is ignored by the production image anyway.
- **RedSky AI** (optional, after RSM approves a provider): set `AI_PROVIDER=anthropic` and `ANTHROPIC_API_KEY=<key>`. Without them, production shows "RedSky AI isn't configured" and sends nothing anywhere.
- **Demo environment** (optional, separate environment only): `REDSKY_DATA_MODE=demo` shows labelled sample data. Never use it where real RSM data is present.

## 6. Build, start, health check, port, private network

The repository includes `railway.json` with these settings. Railway has deprecated config files for new services (see `redsky-twenty/rsm/deploy/railway/README.md`), so **set them in the dashboard too**: `redsky-web` → **Settings**.

| Setting | Value |
|---|---|
| Build → Builder | **Dockerfile**, Dockerfile path `/Dockerfile` (set explicitly) |
| Deploy → Custom start command | empty. The image runs `node server.js`. |
| Deploy → Pre-deploy command | `node dist/migrate.mjs` |
| Deploy → Healthcheck path | `/api/health` |
| Deploy → Healthcheck timeout | `120` |
| Deploy → Restart policy | On failure, 5 retries |
| Deploy → Replicas | 1 |
| Deploy → Serverless (app sleeping) | off |
| Networking → Public | none yet (step 8) |

- **Port and host.** The server listens on the `PORT` Railway injects and binds `0.0.0.0` (set in the image). No port variable is needed.
- **Private network.** `redsky-web` reaches `redsky-postgres` over Railway's private network through the reference variable. It reaches Twenty only if you configure step 10.
- **Deploy order.** `redsky-postgres` must be running before `redsky-web` deploys. The pre-deploy command fails, and the deployment is not promoted, if the database is unreachable.

Click **Deploy** (or push to `main`).

## 7. Run and verify the RedSky-only migrations

The pre-deploy command runs `node dist/migrate.mjs` before each deployment is promoted:

- It takes a Postgres advisory lock, so concurrent deploys don't collide.
- It **refuses** any database that contains Twenty schemas (`core`, `metadata`, `workspace_*`) or another application's tables (exit code 2). The deployment then fails, and the previous one keeps serving.
- It creates everything inside the `redsky` schema and records `redsky.meta.app = redsky`.

Verify:

1. `redsky-web` → **Deployments → latest → Deploy logs** (pre-deploy section) shows `"message":"Migrations complete"`.
2. Optionally, open `redsky-postgres` → **Data**. You should see the `redsky` schema with tables such as `users`, `employee_profiles`, `onboarding_progress`, `user_preferences` and `audit_events`.

## 8. Generate a domain, only once access is protected

Do this **after** the deployment is healthy and the four Entra variables plus `REDSKY_SESSION_SECRET` are set.

1. `redsky-web` → **Settings → Networking → Generate Domain**. Railway asks for the target port; enter the port shown in the deploy logs (`- Local: http://localhost:<port>`), normally `8080` on Railway.
2. Update the Entra redirect URI to `https://<generated domain>/api/auth/entra/callback`.
3. Open `https://<domain>/api/health`. Expect `{"status":"ok", … "auth":"configured","mode":"production"}`. If `auth` reads `unconfigured`, sign-in is still off. Leave the domain until it is fixed (RedSky stays locked meanwhile).

## 9. Test the deployment

- [ ] `/api/health` returns 200 with `database: ok`, `auth: configured`, `mode: production`.
- [ ] Opening `/` redirects to `/login`. **Sign in with Microsoft** works for an RSM account; a non-RSM account is rejected.
- [ ] Onboarding:
  - Fill the profile.
  - Refresh mid-way; you land on the same step with your answers.
  - Sign out and in again; progress is kept.
- [ ] Complete onboarding. Home opens on the chosen "Opens to" view, with the widgets chosen in step 8.
- [ ] Customize home: hide a widget, resize one, reorder. Reload; the changes are kept. **Reset to recommended** restores them.
- [ ] Production separation:
  - No "Sample data" labels anywhere.
  - No sample names (Ridgeline, Priya Raman, Halcyon…).
  - Calendar, Pipeline and other unconnected widgets show "Connect …" states.
  - `/api/demo/persona` and `/api/workstyle/sample` return 404.
- [ ] Workstyle (needs `REDSKY_ENCRYPTION_KEY`):
  - Upload a text-based report and review the values.
  - Upload a scanned PDF; it shows the honest "couldn't read text" state.
  - Remove the data from Settings › My Workstyle.
- [ ] Settings › Profile › **Sign out** ends the session.
- [ ] Twenty is unaffected: `twenty-server` deployments and its `/healthz` are unchanged.

## 10. Optional: Twenty API integration

Do this only after RSM provides a verified endpoint and credentials. Note `redsky-twenty`'s Railway README: the Twenty deployment is currently **staging / pre-production**, with no real client data.

The shared API key below is a stopgap: every RedSky user sees what its role sees, which conflicts with [`DECISIONS.md`](DECISIONS.md) 2. Use it only while Twenty holds no real client data, until per-user access replaces it (decision 7).

1. In Twenty: **Settings → APIs & Webhooks → Create API key**. Give it a dedicated, read-only role if roles are configured. Store it in the password manager.
2. Find Twenty's private address: `twenty-server` → **Settings → Networking → Private Networking** shows `twenty-server.railway.internal`. Find its port from `twenty-server` → **Variables** (`NODE_PORT`; `redsky-twenty` documents `PORT=3000`). Verify both; don't assume them.
3. On `redsky-web` → **Variables**, add:
   ```env
   TWENTY_API_URL=http://twenty-server.railway.internal:<NODE_PORT>
   TWENTY_API_KEY=<the key>
   ```
   Alternatively, use Twenty's public HTTPS domain.
4. Redeploy `redsky-web`.
5. Verify: **People** lists CRM contacts, and record previews open for contacts and companies. The adapter is read-only. Nothing in RedSky writes to Twenty.

## 11. Roll back a failed RedSky deployment

- A failed pre-deploy (migration) or health check never replaces the running deployment. Nothing to do except fix and push again.
- To return to a previous good version: `redsky-web` → **Deployments** → the last good deployment → **⋯ → Redeploy**. This affects `redsky-web` only.
- **Database changes.** Migrations are additive and forward-only. A rollback of the app runs against the newer schema, which older code tolerates for additive changes. For a destructive change, restore from a backup: `redsky-postgres` → **Backups** (enable scheduled backups on the Pro plan before going live).
- To take RedSky offline entirely: remove `redsky-web`'s public domain, or set replicas to 0. Twenty's services are separate and keep running.

## 12. How later pushes deploy, and safeguards

- `redsky-web` (and `redsky-ocr`, once it exists) watch `cody-rsm/redsky-core` **only**. A push to `main` rebuilds and redeploys them and nothing else; pushes to `cody-rsm/redsky-twenty` deploy only the Twenty services. Both RedSky services build from this repository, so give each its watch paths (below and §13): without them, a commit that touches only `services/ocr` also redeploys `redsky-web`, and the reverse.
- Recommended safeguards:
  - Branch protection on `main` (step 2) with the `CI` workflow required.
  - Merge to `main` only from `staging`, after testing a `staging` deployment.
  - Optionally a second Railway environment that tracks `staging`, with its own `redsky-postgres`.
  - In `redsky-web` → **Settings → Source**, enable **Wait for CI**, so Railway deploys only commits whose GitHub checks passed.
  - Optionally add **Watch Paths** (`/src/**`, `/public/**`, `/drizzle/**`, `/scripts/**`, `/package.json`, `/package-lock.json`, `/Dockerfile`, `/next.config.ts`), so documentation-only and `services/` commits don't redeploy it.
  - Keep Railway project membership limited. Rotate `REDSKY_SESSION_SECRET` by replacing it (this signs everyone out). Never rotate `REDSKY_ENCRYPTION_KEY` without a re-encryption plan.

## 13. Optional: Documents and `redsky-ocr`

The Documents page lets people upload files that RedSky stores in its own bucket and reads with `redsky-ocr`, which extracts text, tables and page structure. Design, API, events and security model: [`services/ocr/README.md`](../services/ocr/README.md). Status: built and tested locally, **not deployed**. Nothing below has been applied to the Railway project. Until it is, Documents tells people that document storage isn't set up yet.

### What it adds and reuses

| | |
|---|---|
| New | One service, `redsky-ocr` (API and worker in one container), and the `redsky-documents` bucket |
| Reused | `redsky-postgres` (a separate `redsky_ocr` database and login on the same server), `twenty-server` for its attachments while Twenty owns CRM records |
| Not needed | Redis (the job queue is a Postgres table), any outside OCR or AI service. Twenty's `Postgres` and `Bucket` are never touched |

### Service settings

| Setting | Value |
|---|---|
| Source | GitHub `cody-rsm/redsky-core`, branch `main` |
| Root directory | `/services/ocr` |
| Builder | **Settings → Build → Builder: Dockerfile**, Dockerfile Path `Dockerfile` (relative to the root directory) |
| Watch paths | `/services/ocr/**` |
| Custom start command | empty (the image runs `redsky-ocr serve`) |
| Healthcheck path | `/ready` |
| Public networking | **none**. `redsky-web` and Twenty reach it at `redsky-ocr.railway.internal:8080`. Browsers never call it |
| Resources | Start with a limit of **2 vCPU and 4 GB** (Settings → Deploy → Resource limits). Idle use is about 150 MB; a job with Docling's layout models peaks around 1.5 to 2.5 GB (estimate; measure with the benchmark after the first build) |
| Replicas | 1 |
| Serverless (app sleeping) | off: webhooks would be lost while it sleeps |
| Variables | [`services/ocr/railway.env.example`](../services/ocr/railway.env.example), plus the secrets below |

On `redsky-web`, add the watch paths from §12 if you have not, so OCR commits do not redeploy it.

**Build time and size.** The first build downloads torch (CPU) from PyTorch's index and the Docling layout and TableFormer models from Hugging Face; the running service never downloads anything. Expect an image of roughly 3 GB with models (about 1 GB without, measured). The build log prints the model commits, which are also in `/opt/models/manifest.json`; copy them into `LAYOUT_MODEL_REVISION` and `TABLEFORMER_MODEL_REVISION` to pin later builds. If the build cannot reach either source, set `WITH_DOCLING_MODELS=false`: PDFs and images then go through the Tesseract-only engine (no table structure), and Office files are unaffected.

### Secrets

Set these on `redsky-ocr` as **sealed** variables:

| Variable | How to create it |
|---|---|
| `REDSKY_OCR_DB_PASSWORD` | `openssl rand -hex 24`. Used in `REDSKY_OCR_DATABASE_URL` |
| `REDSKY_OCR_SERVICE_TOKENS` | `openssl rand -hex 32`. The same value goes on `redsky-web` as `OCR_SERVICE_TOKEN` (step 6). To rotate, add a second token after a comma, move `redsky-web` to it, then remove the first |
| `REDSKY_OCR_EVENTS_SECRET` | `openssl rand -hex 32`. The same value goes on `redsky-web` as `OCR_EVENTS_SECRET` |
| `REDSKY_OCR_TWENTY_API_KEY` | Step 4 below |
| `REDSKY_OCR_TWENTY_WEBHOOK_SECRET` | `openssl rand -hex 32`, without a trailing newline. Also pasted into Twenty's webhook (step 5) |

### First deployment

1. **Bucket.** **+ New → Bucket**, named exactly `redsky-documents`. The variable template references its `BUCKET`, `ENDPOINT`, `REGION`, `ACCESS_KEY_ID` and `SECRET_ACCESS_KEY`. Only `redsky-web` and `redsky-ocr` reference it. Check whether Railway can issue a read-only credential for `redsky-ocr`; if it cannot, both services share the bucket's credential, and the service's key-prefix check (`REDSKY_OCR_STORAGE_KEY_PREFIX`) is what limits it.
2. **Twenty services** (for the `twenty` source). Add `OUTBOUND_HTTP_ALLOWED_INTERNAL_HOSTS=redsky-ocr.railway.internal` to `twenty-server` and `twenty-worker` (the worker sends webhooks). Twenty's SSRF protection otherwise refuses private addresses; this opens exactly one host. Record it in `redsky-twenty`'s `rsm/deploy/railway/common.env.example` when you apply it.
3. **Create the service** as an empty service named exactly `redsky-ocr` (the private hostname comes from the name), set its settings and variables, connect the repository and deploy. On this first start `REDSKY_OCR_ADMIN_DATABASE_URL` lets it create the `redsky_ocr` login and database on `redsky-postgres`; once `/ready` answers, **delete that variable** and redeploy, so the running service holds no superuser credentials.
4. **Twenty API key.** In Twenty, **Settings → Roles → Create role** `RedSky OCR`: no access to all records; object permissions **read only** on Attachments, Companies, People, Opportunities, Notes and Tasks, and on every custom object that can hold files (Twenty hides an attachment whose parent record the caller cannot read); no settings or tool permissions; assignable to API keys only. Then **Settings → APIs & Webhooks → Create API key** `redsky-ocr` with that role and a one-year expiry. Paste the key into `REDSKY_OCR_TWENTY_API_KEY`.
5. **Twenty webhook.** **Settings → APIs & Webhooks → Create webhook**: URL `http://redsky-ocr.railway.internal:8080/api/v1/webhooks/twenty`, events on Attachments (created, deleted, destroyed, restored, or all), secret `REDSKY_OCR_TWENTY_WEBHOOK_SECRET`.
6. **Connect `redsky-web`.** Add these to `redsky-web` → **Variables** (seal the two secrets) and redeploy it. The migration for the `documents` table runs in its pre-deploy step.
   ```env
   REDSKY_TENANT_ID=rsm
   DOCUMENTS_BUCKET=${{redsky-documents.BUCKET}}
   DOCUMENTS_S3_ENDPOINT=${{redsky-documents.ENDPOINT}}
   DOCUMENTS_S3_REGION=${{redsky-documents.REGION}}
   DOCUMENTS_S3_ACCESS_KEY_ID=${{redsky-documents.ACCESS_KEY_ID}}
   DOCUMENTS_S3_SECRET_ACCESS_KEY=${{redsky-documents.SECRET_ACCESS_KEY}}
   OCR_URL=http://redsky-ocr.railway.internal:8080
   OCR_SERVICE_TOKEN=<one of REDSKY_OCR_SERVICE_TOKENS>
   OCR_EVENTS_SECRET=<REDSKY_OCR_EVENTS_SECRET>
   ```
   Then point `redsky-ocr`'s events at `redsky-web` over the private network: `REDSKY_OCR_EVENTS_URL=http://redsky-web.railway.internal:<port>/api/internal/ocr/events`, with the port `redsky-web` listens on (its deploy logs show it, normally `8080`), and set `REDSKY_OCR_TWENTY_TENANT_ID` to the same value as `REDSKY_TENANT_ID`. If the Railway environment predates dual-stack private networking (October 2025), `redsky-web` must listen on IPv6 too: set `HOSTNAME=::` on it.
7. **Check.** In RedSky, open **Documents**, upload a PDF and wait for **Ready**; open it and compare the text with the file. `redsky-web`'s log shows `Text extraction event` with `outcome: applied`; without it, statuses still update, more slowly, because the page re-reads them. For the Twenty source, upload a file on any company's Files tab in Twenty: within a minute `redsky-ocr`'s log shows `job finished` with `outcome: completed`. Logs contain ids and timings only.

Twenty neither retries webhooks nor sends them while it is rate-limiting, or for records not every role may see. A sweep every ten minutes (`REDSKY_OCR_RECONCILE_INTERVAL_SECONDS`) lists recent attachments with the API key and queues any the webhook missed. Attachments from before the deployment are not processed unless you ask: in the service's shell (`railway ssh`), `redsky-ocr backfill --since 2026-01-01`.

### Rollback and removal

- A failed health check never replaces the running deployment. To go back, redeploy the last good deployment of `redsky-ocr`; this affects nothing else.
- To switch Documents off without deleting anything, remove `OCR_URL` (or the `DOCUMENTS_*` variables) from `redsky-web` and redeploy it. The page then says document storage isn't set up; stored files and their text stay where they are.
- Migrations are additive. To remove the service entirely: delete the Twenty webhook and the SSRF allow-list entry, delete `redsky-ocr`, and drop the `redsky_ocr` database and login on `redsky-postgres`.

### Cost and scaling

Railway bills usage. At an idle footprint of about 150 MB and near-zero CPU, the service costs a few dollars a month; each job adds CPU-seconds and memory for its duration (seconds to a few minutes). Check Railway's current prices before relying on any figure. There are no per-page or per-document fees.

| Need | Change |
|---|---|
| More documents at once | `REDSKY_OCR_WORKER_CONCURRENCY` (each job is one process; about 2 GB each with layout models) and the resource limit |
| Keep the API responsive under heavy OCR | Run a second service from the same source with start command `redsky-ocr worker` and no healthcheck, and set `REDSKY_OCR_WORKER_ENABLED=false` on `redsky-ocr`. Both share the queue in Postgres |
| Difficult layouts and handwriting | Granite Docling on GPU hardware RSM controls behind an OpenAI-compatible endpoint, then `REDSKY_OCR_GRANITE_DOCLING_MODE=remote` and `REDSKY_OCR_GRANITE_DOCLING_API_URL`. Not provisioned |
| Malware scanning | A `clamav` service (about 1.5 to 3 GB RAM for signatures) and `REDSKY_OCR_CLAMAV_HOST=clamav.railway.internal` |

---

## Deployment checklist

| Item | State |
|---|---|
| Dockerfile, `.dockerignore`, `railway.json`, standalone build | **Verified locally** (Docker build + run, non-root, health check) |
| Migration runner: fresh DB, re-run, refusal of Twenty's DB | **Verified locally** (`node dist/migrate.mjs` in the image) |
| Production image blocks development sign-in | **Verified locally** (404) |
| CSP / HSTS / security headers | **Verified locally** |
| Lint, typecheck, unit + component tests, e2e tests, production build | **Verified locally** (see the CI workflow for the same commands) |
| `redsky-web` and `redsky-postgres` services on Railway | **Not created**: needs your action (steps 3–4) |
| Entra ID app registration and the four auth variables | **Requires credentials** |
| `REDSKY_SESSION_SECRET`, `REDSKY_ENCRYPTION_KEY` | **Requires generation** by you (step 5) |
| Railway domain | **Unconfigured**: generate only after auth works (step 8) |
| `ANTHROPIC_API_KEY` (RedSky AI) | **Requires credentials and approval**; AI shows "not configured" until then |
| Twenty API URL + key | **Requires verified endpoint and credentials** (step 10); People shows "not connected" until then |
| Outlook, Teams, SharePoint, LegiStorm and other connectors | **Not implemented**: "Coming soon" with notify list |
| Scheduled `redsky-postgres` backups | **Unconfigured**: enable before real data |
| Custom domain | **Unconfigured** |
| `redsky-ocr` image build, tests, Twenty attachment path | **Verified locally** (Docker, and against a local Twenty 2.44) |
| `redsky-ocr` and `redsky-documents` on Railway | **Not created**: needs approval and your action (§13) |
| Documents page: upload, status, text and tables, search, download, delete, sharing | **Verified locally** against `redsky-ocr` (Docker image), an S3-compatible stand-in and Postgres, in the browser and with the production build |
| `redsky-ocr` events into `redsky-web` | **Verified locally** (signed delivery applied; a forged event is refused) |
