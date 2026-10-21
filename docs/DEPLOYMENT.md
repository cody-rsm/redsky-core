# Deploying RedSky to Railway

RedSky is added to the **existing** Railway project as these services:

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
> **Used in production:** these steps were followed for the production environment on 2026-10-20 (services, custom domain, Entra sign-in). See the checklist at the end for what is done and what remains.
>
> **Applied since:** §13 stage 1 (Documents and `redsky-ocr`). Stage 2 (Twenty attachments) is not.

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
4. Only RedSky services reference this database: `redsky-web` (next step) and, with §13, `redsky-ocr` through its own login. Do not reference `redsky-postgres` from the Twenty services, and do not reference Twenty's `Postgres` from any RedSky service.
5. Don't rename Twenty's `Postgres`, `Redis` or `Bucket`. Twenty's variables reference them by name.
6. RedSky needs no Redis ([`DECISIONS.md`](DECISIONS.md) 14). Its only bucket is `redsky-documents`, created with Documents (§13).

## 5. Set `redsky-web` variables

Open `redsky-web` → **Variables → Raw Editor** and paste the following, then fill the blanks. Use the **service's** variables, not the project's Shared Variables: shared values are visible to Twenty's services too ([`DECISIONS.md`](DECISIONS.md) 13). Generate the secrets on your own machine and store them in RSM's password manager **before** pasting:

```bash
openssl rand -base64 48    # REDSKY_SESSION_SECRET
openssl rand -base64 32    # REDSKY_ENCRYPTION_KEY  (losing it makes stored Workstyle data unreadable)
```

```env
NODE_ENV=production
PORT=3000
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
- `REDSKY_APP_URL` must match the address people use. The reference fills in once a Railway domain exists. With the custom domain (step 8), set it explicitly to `https://redsky.rsmcapital.com`, with no trailing slash.
- `PORT=3000` pins the port the server listens on, so the domain in step 8 can target it. Without it, Railway injects its own `PORT`, and the domain's target port has to match whatever that is.
- Leave the three `AUTH_ENTRA_*` values empty for now. The Entra registration needs RedSky's domain, which you generate in step 8.
- Until all four auth values (tenant, client ID, secret, session secret) are set, RedSky shows "Sign-in isn't configured" and every API returns 401.
- **Never set** `AUTH_DEV_ENABLED` on Railway. It is ignored by the production image anyway.
- After saving `AUTH_ENTRA_CLIENT_SECRET`, `REDSKY_SESSION_SECRET` and `REDSKY_ENCRYPTION_KEY`, **seal** them (variable **⋯ → Seal**) if your plan offers it. Sealed values reach the app but can't be viewed again, so keep the originals in the password manager.
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

- **Port and host.** The server binds `0.0.0.0` (set in the image) and listens on `PORT`, which step 5 pins to `3000`.
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

## 8. Domain, custom domain, then sign-in

RedSky fails closed: without the Entra variables, the login page says sign-in isn't configured and every API returns 401. It is therefore safe to give it an address before sign-in works, and the Entra registration needs that address anyway.

### 8a. Railway domain
1. Once the deployment is healthy: `redsky-web` → **Settings → Networking → Generate Domain**, target port **`3000`**. Railway's form defaults to `8080`, which returns errors because the app listens on `3000`. Check an existing domain's port with its pencil icon.
2. Open `https://<domain>/api/health`. Expect `"database":"ok"` and `"auth":"unconfigured"`. Open `https://<domain>/`; it should show the locked sign-in page.

### 8b. Custom domain `redsky.rsmcapital.com` (Cloudflare)
1. `redsky-web` → **Settings → Networking → Custom Domain**: `redsky.rsmcapital.com`, port **`3000`**. Railway shows two records: a `CNAME` for `redsky` and a `TXT` for `_railway-verify.redsky`.
2. Skip Railway's **Connect** (one-click Cloudflare). It grants Railway ongoing edit access to the `rsmcapital.com` zone, which also carries the company email records. Instead, in Cloudflare → `rsmcapital.com` → **DNS → Records → Add record**:

   | Type | Name | Target / content | Proxy |
   |---|---|---|---|
   | `CNAME` | `redsky` | the target Railway shows (`<id>.up.railway.app`) | **DNS only** (grey cloud) |
   | `TXT` | `_railway-verify.redsky` | the full `railway-verify=…` value (use Railway's copy button) | n/a |

   Type only the short names; Cloudflare adds `.rsmcapital.com`. **DNS only** lets Railway issue the certificate, and leaves Cloudflare's zone-wide SSL mode untouched.
3. Wait until Railway shows the domain as verified (minutes, sometimes up to an hour). To check from a terminal:
   ```bash
   dig +short CNAME redsky.rsmcapital.com
   dig +short TXT _railway-verify.redsky.rsmcapital.com
   ```
4. Set `REDSKY_APP_URL=https://redsky.rsmcapital.com` and deploy. From then on, requests that save data are accepted only from that address. The Railway domain is useful only for health checks, and can be removed.

### 8c. Register RedSky in Microsoft Entra ID
Microsoft Entra admin center → **App registrations → New registration**:

1. Name `RedSky`.
2. **Supported account types:** single tenant ("this organizational directory only").
   - The tenant is shown by its directory name (RSM's is *Natural State Renewables*).
   - Confirm it's the directory that holds the `@rsmcapital.com` accounts: **Overview**, or **Settings → Domain names**.
3. **Redirect URI:** platform **Web** (not SPA or public client: RedSky's server completes sign-in with a client secret), `https://redsky.rsmcapital.com/api/auth/entra/callback`.
4. **Certificates & secrets → New client secret.**
   - Copy the **Value** column immediately (it's shown once). The **Secret ID** is not used anywhere.
   - Note the expiry in a calendar: sign-in stops working when the secret expires.
5. **API permissions:** keep Microsoft Graph delegated `User.Read`.
6. **Grant admin consent for <tenant>.**
   - This needs the Global Administrator, Privileged Role Administrator or Cloud Application Administrator role.
   - Without it, staff see **"Need admin approval"** at sign-in, because the tenant doesn't let users approve apps themselves.
   - Users can't consent just for themselves either. Alternatively, an admin can follow "Have an admin account?" on that screen and tick **Consent on behalf of your organization**.
7. **Restrict who can sign in** (recommended; essential if the tenant holds people who shouldn't use RedSky):
   - **Enterprise applications → RedSky → Properties → Assignment required? → Yes**.
   - Then add people or groups under **Users and groups**. Unassigned people get a "not assigned" error.
8. Optional:
   - **App roles → Create app role** `RedSky.Admin` (member type Users/Groups), assigned to administrators.
   - **Branding & properties → Publisher domain** `rsmcapital.com`, so the Microsoft screens stop showing the tenant's other domain.
   - **Enterprise applications → Consent and permissions → Admin consent settings → Users can request admin consent → Yes**. The "Need admin approval" screen then offers **Request approval**.
9. From **Overview**, copy the **Directory (tenant) ID** and the **Application (client) ID**.

### 8d. Turn on sign-in
1. In `redsky-web` → **Variables**:

   | From Entra | Variable |
   |---|---|
   | Directory (tenant) ID | `AUTH_ENTRA_TENANT_ID` |
   | Application (client) ID | `AUTH_ENTRA_CLIENT_ID` |
   | Client secret **Value** | `AUTH_ENTRA_CLIENT_SECRET` |

   Then deploy.
2. `/api/health` shows `"auth":"configured"`. If it still reads `unconfigured`, the deploy logs contain a "Configuration incomplete" line naming the missing or invalid variable (names only, never values).

## 9. Test the deployment

- [ ] `/api/health` returns 200 with `database: ok`, `auth: configured`, `mode: production`.
- [ ] Opening `/` redirects to `/login`. **Sign in with Microsoft** works for an RSM account; a non-RSM account is rejected.
- [ ] An Entra user who isn't assigned to RedSky (when assignment is required) is refused.
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

## 10. Connect Twenty: each person, through Twenty's OAuth

This is roadmap step 1 of [`CRM_INTEGRATION.md`](CRM_INTEGRATION.md). RedSky reads and writes Twenty **as each signed-in person**, through Twenty's built-in OAuth authorization server, so Twenty's roles decide what each person sees and Twenty records them as the author ([`DECISIONS.md`](DECISIONS.md) 2 and 16). Each person approves RedSky once.

- **Pre-production data only.** Twenty holds no real client data until the Enterprise-free build exists (`redsky-twenty` decision 1).
- **Don't roll the CRM out to staff yet** (decision 10).
- **Nothing changes on the Twenty services.** Registering RedSky is a setting inside Twenty, not a deployment change.

### 10a. Before you start
- **Who can connect.** Each person who will connect must be a member of the Twenty workspace, able to sign in to Twenty with Microsoft. If RSM's workspace settings have been applied (`redsky-twenty/rsm/config/workspace-config.mjs` enforces two-factor), Twenty also asks for its own two-factor code, so each person sets up an authenticator app in Twenty the first time.
- **Twenty's address.** In `twenty-server` → **Variables**, note the resolved value of `SERVER_URL`, for example `https://twenty-server-production-xxxx.up.railway.app`. RedSky must use exactly this address, with no trailing slash: Twenty only issues codes for an issuer it publishes.

### 10b. Register RedSky in Twenty
Twenty's settings screens have no form for this; it is one GraphQL call.
1. In Twenty: **Settings → MCP & APIs → Create API key**, named `register-redsky`, with a role that has the **API keys & webhooks** permission (Twenty's Admin role, or `rsm-core`'s Platform admin once installed) and a 1-day expiry.
2. On your computer, run this with your values:
   ```bash
   curl -sS "$TWENTY_SERVER_URL/metadata" \
     -H "Authorization: Bearer $REGISTER_KEY" -H 'Content-Type: application/json' \
     -d '{"query":"mutation($input: CreateApplicationRegistrationInput!) { createApplicationRegistration(input: $input) { clientSecret applicationRegistration { oAuthClientId } } }","variables":{"input":{"name":"RedSky","oAuthRedirectUris":["https://redsky.rsmcapital.com/api/integrations/twenty/callback"],"oAuthScopes":["api","profile"]}}}'
   ```
   The response contains `oAuthClientId` and `clientSecret`. **The secret is shown only once**: put both in the password manager.
3. Delete the `register-redsky` API key.

The registration then appears under **Settings → Applications → Developer → My apps**, where you can change its redirect URIs or rotate the secret later.

### 10c. Set `redsky-web`'s variables
On `redsky-web` → **Variables**, add these (seal the secret) and deploy:
```env
TWENTY_PUBLIC_URL=<Twenty's SERVER_URL, exactly>
TWENTY_API_URL=http://${{twenty-server.RAILWAY_PRIVATE_DOMAIN}}:3000
TWENTY_OAUTH_CLIENT_ID=<oAuthClientId>
TWENTY_OAUTH_CLIENT_SECRET=<clientSecret>
```
- `TWENTY_PUBLIC_URL` is where browsers approve RedSky and where RedSky exchanges codes for tokens.
- `TWENTY_API_URL` is where RedSky's server reads and writes records, over the private network. The port is Twenty's `NODE_PORT`.
- **Remove `TWENTY_API_KEY` if it is set.** With OAuth configured it is ignored, and the log says so.
- The deployment applies the `crm_connections` migration in its pre-deploy step. Tokens are stored encrypted with `REDSKY_ENCRYPTION_KEY`.

### 10d. Try it
1. In RedSky, open **People** and choose **Connect CRM**. The same option is under **Settings → Connected apps**.
2. Sign in to Twenty with Microsoft, enter Twenty's two-factor code if asked, and choose **Authorize** on Twenty's consent page.
3. You land back on **People**, showing the contacts your Twenty role allows. **⌘K** finds them too.
4. **Check permissions.** A second person with a narrower Twenty role connects and sees only what that role allows.
5. **Check disconnecting.** **Settings → Connected apps → Disconnect** revokes RedSky's access in Twenty. People then asks to connect again.

**Not verified yet:** if you aren't signed in to Twenty when you choose Connect, Twenty may not return you to its consent page after sign-in. If you land on Twenty's home page instead, go back to RedSky and choose **Connect CRM** again.

### 10e. If it doesn't work
| Symptom | Cause |
|---|---|
| Twenty shows "Not found" instead of the consent page | `TWENTY_OAUTH_CLIENT_ID` does not match a registration |
| Twenty says `redirectUrl mismatch` | The registration's redirect URI is not exactly `https://redsky.rsmcapital.com/api/integrations/twenty/callback` |
| Twenty says `Unknown issuer` | `TWENTY_PUBLIC_URL` is not exactly Twenty's `SERVER_URL` |
| Back on People with "RedSky couldn't finish connecting" | `redsky-web`'s log line `CRM connection failed` gives the reason (for example `invalid_client`: wrong secret) |
| People says "couldn't reach the CRM" | `TWENTY_API_URL` doesn't resolve (hover it), or `twenty-server` is down |

**Stopgap without OAuth.** With only `TWENTY_API_URL` and `TWENTY_API_KEY` set, RedSky reads Twenty with one shared read-only key: every RedSky user sees what that key's role sees. Use it only with pre-production data.

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
  - Optionally add **Watch Paths** (`/src/**`, `/public/**`, `/drizzle/**`, `/scripts/**`, `/package.json`, `/package-lock.json`, `/Dockerfile`, `/next.config.ts`, `/tsconfig.json`, `/railway.json`), so documentation-only and `services/` commits don't redeploy it.
  - Keep Railway project membership limited. Rotate `REDSKY_SESSION_SECRET` by replacing it (this signs everyone out). Never rotate `REDSKY_ENCRYPTION_KEY` without a re-encryption plan.

## 13. Optional: Documents and `redsky-ocr`

The Documents page lets people upload files that RedSky stores in its own bucket and reads with `redsky-ocr`, which extracts text, tables and page structure. Design, API, events and security model: [`services/ocr/README.md`](../services/ocr/README.md). Status: **stage 1 deployed**; stage 2 not. Without `OCR_URL` or the `DOCUMENTS_*` variables, Documents tells people that document storage isn't set up.

It deploys in two stages:
- **Stage 1: files uploaded in RedSky.** The bucket, `redsky-ocr` and `redsky-web`'s variables. Nothing changes on the Twenty services.
- **Stage 2: Twenty attachments.** `redsky-ocr` also extracts files attached in Twenty. This changes `twenty-server` and `twenty-worker` (one variable, which redeploys them), and adds a role, an API key and a webhook in Twenty. RedSky doesn't list Twenty attachments yet, and when it does it must check each one as the signed-in user ([`DECISIONS.md`](DECISIONS.md) 2), so do stage 2 with per-user access (roadmap step 2 in [`CRM_INTEGRATION.md`](CRM_INTEGRATION.md)), not before.

### What it adds and reuses

| | |
|---|---|
| New | One service, `redsky-ocr` (API and worker in one container), and the `redsky-documents` bucket |
| Reused | `redsky-postgres` (a separate `redsky_ocr` database and login on the same server); in stage 2, `twenty-server` for its attachments while Twenty owns CRM records |
| Not needed | Redis (the job queue is a Postgres table), any outside OCR or AI service. Twenty's `Postgres` and `Bucket` are never touched |

### Service settings

| Setting | Value |
|---|---|
| Source | GitHub `cody-rsm/redsky-core`, branch `main` |
| Root directory | `/services/ocr` |
| Builder | **Settings → Build → Builder: Dockerfile**, Dockerfile Path `Dockerfile` (relative to the root directory) |
| Watch paths | `/services/ocr/**` |
| Railway config file | `/services/ocr/railway.json` (**Settings → Config-as-code**), if the setting is offered. The repository-root `railway.json` is `redsky-web`'s: its pre-deploy migration and `/api/health` check would fail this service. If **Deploy** shows a pre-deploy command or `/api/health`, the service is reading the wrong file |
| Custom start command | empty (the image runs `redsky-ocr serve`) |
| Healthcheck path | `/ready` |
| Public networking | **none**. `redsky-web` and Twenty reach it at `redsky-ocr.railway.internal:8080`. Browsers never call it |
| Resources | Start with a limit of **2 vCPU and 4 GB** (Settings → Deploy → Resource limits). Idle use is about 150 MB; a job with Docling's layout models peaks around 1.5 to 2.5 GB (estimate; measure with the benchmark after the first build) |
| Replicas | 1 |
| Serverless (app sleeping) | off: webhooks would be lost while it sleeps |
| Variables | [`services/ocr/railway.env.example`](../services/ocr/railway.env.example) (its stage 2 lines stay commented out until stage 2), plus the secrets below |

On `redsky-web`, add the watch paths from §12 if you have not, so OCR commits do not redeploy it.

**Build time and size.** The first build downloads torch (CPU) from PyTorch's index and the Docling layout and TableFormer models from Hugging Face; the running service never downloads anything. Expect an image of roughly 3 GB with models (about 1 GB without, measured). The build log prints the model commits, which are also in `/opt/models/manifest.json`; copy them into `LAYOUT_MODEL_REVISION` and `TABLEFORMER_MODEL_REVISION` to pin later builds. If the build cannot reach either source, set `WITH_DOCLING_MODELS=false`: PDFs and images then go through the Tesseract-only engine (no table structure), and Office files are unaffected.

### Secrets

Set these on `redsky-ocr` as service variables, never as Shared Variables ([`DECISIONS.md`](DECISIONS.md) 13), and seal them, except `REDSKY_OCR_DB_PASSWORD`: `REDSKY_OCR_DATABASE_URL` references it, and that reference was not verified with a sealed value. It protects nothing the `redsky-postgres` superuser credentials, visible to the same people, don't already expose. Two of the secrets are also needed on `redsky-web`: paste the same value there, sealed too.

| Variable | Stage | How to create it |
|---|---|---|
| `REDSKY_OCR_DB_PASSWORD` | 1 | `openssl rand -hex 24`. Used in `REDSKY_OCR_DATABASE_URL`. Not sealed (above) |
| `REDSKY_OCR_SERVICE_TOKENS` | 1 | `openssl rand -hex 32`. The same value goes on `redsky-web` as `OCR_SERVICE_TOKEN` (step 4). To rotate, add a second token after a comma, move `redsky-web` to it, then remove the first |
| `REDSKY_OCR_EVENTS_SECRET` | 1 | `openssl rand -hex 32`. The same value goes on `redsky-web` as `OCR_EVENTS_SECRET` |
| `REDSKY_OCR_TWENTY_API_KEY` | 2 | Stage 2, step 2 |
| `REDSKY_OCR_TWENTY_WEBHOOK_SECRET` | 2 | `openssl rand -hex 32`, without a trailing newline. Also pasted into Twenty's webhook (stage 2, step 3) |

### Stage 1: files uploaded in RedSky

1. **Bucket.** **+ New → Bucket**, named exactly `redsky-documents`. The variable template references its `BUCKET`, `ENDPOINT`, `REGION`, `ACCESS_KEY_ID` and `SECRET_ACCESS_KEY`. Only `redsky-web` and `redsky-ocr` reference it. Check whether Railway can issue a read-only credential for `redsky-ocr`; if it cannot, both services share the bucket's credential, and the service's key-prefix check (`REDSKY_OCR_STORAGE_KEY_PREFIX`) is what limits it.
2. **Create the service** as an empty service named exactly `redsky-ocr` (the private hostname comes from the name). Set its settings, its stage 1 secrets and the variables from the template. The template's `REDSKY_OCR_EVENTS_URL` sends events to `redsky-web` on port 3000, its pinned `PORT` (step 5). Connect the repository and deploy. On this first start `REDSKY_OCR_ADMIN_DATABASE_URL` lets it create the `redsky_ocr` login and database on `redsky-postgres`; once `/ready` answers, **delete that variable** and redeploy, so the running service holds no superuser credentials.
3. **Watch paths.** Set `redsky-ocr`'s watch paths (above), and `redsky-web`'s (§12), so each service redeploys only for its own code.
4. **Connect `redsky-web`.** Add these to `redsky-web` → **Variables** (seal the two secrets) and redeploy it. The migration for the `documents` table already ran with the first deployment that included it.
   ```env
   REDSKY_TENANT_ID=rsm
   DOCUMENTS_BUCKET=${{redsky-documents.BUCKET}}
   DOCUMENTS_S3_ENDPOINT=${{redsky-documents.ENDPOINT}}
   DOCUMENTS_S3_REGION=${{redsky-documents.REGION}}
   DOCUMENTS_S3_ACCESS_KEY_ID=${{redsky-documents.ACCESS_KEY_ID}}
   DOCUMENTS_S3_SECRET_ACCESS_KEY=${{redsky-documents.SECRET_ACCESS_KEY}}
   OCR_URL=http://${{redsky-ocr.RAILWAY_PRIVATE_DOMAIN}}:8080
   OCR_SERVICE_TOKEN=<one of REDSKY_OCR_SERVICE_TOKENS>
   OCR_EVENTS_SECRET=<REDSKY_OCR_EVENTS_SECRET>
   ```
   If the Railway environment predates dual-stack private networking (October 2025), `redsky-web` must listen on IPv6 too for `redsky-ocr`'s events to reach it: set `HOSTNAME=::` on it.
5. **Check.** `/api/health` reports `documents: configured`. In RedSky, open **Documents**, upload a PDF and wait for **Ready**; open it and compare the text with the file. `redsky-web`'s log shows `Text extraction event` with `outcome: applied`; without it, statuses still update, more slowly, because the page re-reads them. Logs contain ids and timings only.

### Stage 2: Twenty attachments

Do this with per-user access (above), after approval for the Twenty-side changes.

1. **Twenty services.** Add `OUTBOUND_HTTP_ALLOWED_INTERNAL_HOSTS=redsky-ocr.railway.internal` to `twenty-server` and `twenty-worker` (the worker sends webhooks). Twenty's SSRF protection otherwise refuses private addresses; this opens exactly one host. Record it in `redsky-twenty`'s `rsm/deploy/railway/common.env.example` when you apply it.
2. **Twenty API key.** In Twenty, **Settings → Roles → Create role** `RedSky OCR`: no access to all records; object permissions **read only** on Attachments, Companies, People, Opportunities, Notes and Tasks, and on every custom object that can hold files (Twenty hides an attachment whose parent record the caller cannot read); no settings or tool permissions; assignable to API keys only. Then **Settings → APIs & Webhooks → Create API key** `redsky-ocr` with that role and a one-year expiry. Paste the key into `REDSKY_OCR_TWENTY_API_KEY`.
3. **Twenty webhook.** **Settings → APIs & Webhooks → Create webhook**: URL `http://redsky-ocr.railway.internal:8080/api/v1/webhooks/twenty`, events on Attachments (created, deleted, destroyed, restored, or all), secret `REDSKY_OCR_TWENTY_WEBHOOK_SECRET`.
4. **Turn the source on.** Uncomment the stage 2 lines in `redsky-ocr`'s variables (`REDSKY_OCR_TWENTY_URL`, `REDSKY_OCR_TWENTY_PUBLIC_URL`, `REDSKY_OCR_TWENTY_TENANT_ID` set to the same value as `REDSKY_TENANT_ID`), add the two stage 2 secrets, and redeploy it.
5. **Check.** Upload a file on any company's Files tab in Twenty: within a minute `redsky-ocr`'s log shows `job finished` with `outcome: completed`.

Twenty neither retries webhooks nor sends them while it is rate-limiting, or for records not every role may see. A sweep every ten minutes (`REDSKY_OCR_RECONCILE_INTERVAL_SECONDS`) lists recent attachments with the API key and queues any the webhook missed. Attachments from before the deployment are not processed unless you ask: in the service's shell (`railway ssh`), `redsky-ocr backfill --since 2026-01-01`.

### Rollback and removal

- A failed health check never replaces the running deployment. To go back, redeploy the last good deployment of `redsky-ocr`; this affects nothing else.
- To switch Documents off without deleting anything, remove `OCR_URL` (or the `DOCUMENTS_*` variables) from `redsky-web` and redeploy it. The page then says document storage isn't set up; stored files and their text stay where they are.
- Migrations are additive. To remove the service entirely: delete the Twenty webhook and the SSRF allow-list entry (if stage 2 was done), delete `redsky-ocr`, and drop the `redsky_ocr` database and login on `redsky-postgres`.

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
| Lint, typecheck, unit + component tests, e2e tests, production build | **Verified locally and in CI** |
| `redsky-web` and `redsky-postgres` on Railway | **Done**, production environment |
| Custom domain `redsky.rsmcapital.com` | **Done**: Cloudflare DNS-only records |
| `REDSKY_SESSION_SECRET`, `REDSKY_ENCRYPTION_KEY`, Entra variables | **Done**: `/api/health` reports `auth: configured` |
| Entra admin consent | **Pending**: needs a tenant administrator (step 8c.6) |
| Entra "Assignment required" | **Recommended**: confirm it's on, with the right people assigned |
| Scheduled `redsky-postgres` backups | **To do** before real data |
| Railway-generated domain | Optional: remove once the custom domain is confirmed |
| `ANTHROPIC_API_KEY` (RedSky AI) | **Requires credentials and approval**; AI shows "not configured" until then |
| Per-person Twenty access (OAuth) | **Built, not yet tried on staging**: register RedSky and set the variables (step 10) |
| CRM write path, record pages, mailbox connection | **Not built**: [`CRM_INTEGRATION.md`](CRM_INTEGRATION.md) roadmap steps 2–4 |
| Outlook, Teams, SharePoint, LegiStorm, Harmonic, PitchBook, AlphaSense and other connectors | **Not implemented**: "Coming soon" with notify list |
| `redsky-ocr` image build, tests, Twenty attachment path | **Verified locally** when built (Docker, and against a local Twenty 2.44) |
| Documents page: upload, status, text and tables, search, download, delete, sharing | **Verified locally** when built, against `redsky-ocr` (Docker image), an S3-compatible stand-in and Postgres, in the browser and with the production build |
| `redsky-ocr` events into `redsky-web` | **Verified locally** when built (signed delivery applied; a forged event is refused) |
| `documents` table migration (`drizzle/0001_documents.sql`) | **Applied** in `redsky-web`'s pre-deploy step; additive |
| `redsky-ocr` and `redsky-documents` on Railway | **Done** (§13, stage 1) |
| `redsky-ocr` Twenty attachment source | **Off**: changes Twenty's services; turn on with per-user access (§13, stage 2) |

Status as of 2026-10-21. Update this table as items change.
