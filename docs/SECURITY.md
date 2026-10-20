# RedSky security model

## Authentication

- **Microsoft Entra ID.** The OIDC authorization-code flow with PKCE runs through `openid-client`.
  - **Single tenant.** A tenant GUID is required; `common` and `organizations` are rejected, and the `tid` claim is checked.
  - **Short-lived transaction cookie.** It carries the state, nonce and PKCE verifier.
  - **Graph `/me` lookup.** It runs once at sign-in (delegated `User.Read`) to prefill the profile. The access token is not stored.
- **Sessions are server-side.**
  - The browser holds an opaque 256-bit token in an `HttpOnly`, `Secure`, `SameSite=Lax` cookie, named `__Host-redsky_session` in production.
  - The database stores only its SHA-256 hash.
  - Sessions expire after `REDSKY_SESSION_TTL_HOURS` (default 12). Sign-out deletes the row.
- **Development sign-in** (pick a demo persona) exists only when `NODE_ENV !== 'production'` *and* `AUTH_DEV_ENABLED=true`.
  - The production image answers 404 on `/api/auth/dev/login`, whatever the environment says.
  - Sessions created by development sign-in are rejected in production.
- **No credentials configured means locked.** A production deployment without Entra configuration shows "Sign-in isn't configured", and every API returns 401. There are no default or fallback credentials.

## Authorization

- **Access roles** are `member` and `admin`. Admin comes from the Entra app role named in `AUTH_ENTRA_ADMIN_ROLE`. Onboarding focus areas are personalization, never permissions.
- **Object-level checks.** Every service call passes an `Actor` to `security/access-policy.ts`:
  - **Own data** (profile, preferences, layout, onboarding, tasks, AI conversations): owner only.
  - **Workstyle data:** owner only. **Administrators have no read path.** Denied attempts are audited.
  - **Records:** classification tiers (`public`/`internal`/`confidential`/`restricted`). Restricted records fail closed without team membership (hook for deal walls).
  - **Audit log:** administrators, read only.
- **Mutations** require a same-origin `Origin` header (CSRF) and a valid session.
  - Expensive or abusable endpoints are rate limited per user: AI questions, confirmed actions, task creation, search, photo and report uploads.
  - Rate limits are in-memory, so they hold per instance. Use one replica, or move them to a shared store before scaling out.

## Workstyle Intelligence privacy

- **Upload.** Upload is optional and needs explicit consent. The consent text is versioned (`WS_CONSENT_VERSION`), and every grant and revocation is logged in `workstyle_consent_log`.
- **File validation.** Files must be PDFs (magic bytes, not the declared type), at most 10 MB. Uploads are rate limited. Extraction is text-only, and nothing is executed.
- **Encryption.**
  - The extracted draft, the reviewed profile and the file name are encrypted with AES-256-GCM using `REDSKY_ENCRYPTION_KEY`.
  - Each ciphertext is bound to its owner and field through associated data, so ciphertext copied to another user's row fails to decrypt.
  - The original PDF is discarded after extraction unless `WORKSTYLE_RETAIN_ORIGINAL=true`; if kept, it is encrypted the same way.
- **Review before use.** Nothing is used until the employee reviews the values. Scanned or unrecognized reports say so plainly and offer manual entry; values are never guessed.
- **Sharing** is off by default. Each sharing scope needs its own consent dialog. Sharing exposes only a preference summary, never scores or the report.
- **Deletion** is a hard delete of the report, the insights and the decisions. Current settings stay as they are.
- **Audit.** Every read of assessment data, the owner's included, writes `workstyle.read` to the audit log.
- **Use limits.** Workstyle data is never used for ranking, evaluation or employment decisions, and the product copy says so where data is collected.

## AI safeguards

- **Provider and key.** The provider key is server-only. With no approved provider configured, production refuses to send anything.
- **Context.** Context retrieval is limited to the asking employee's own RedSky data, plus a list of sources that are *not* connected, so the model cannot claim them.
- **Structured output.** Answers are validated with Zod. Refusals and malformed outputs become a safe message.
- **Proposed actions** (create tasks, save drafts) are structured data. They run only through `/api/actions/confirm`, after the confirmation dialog. The server:
  - re-derives the action from its own stored message, not from client input;
  - authorizes it;
  - makes it idempotent per action key;
  - writes it to the audit log.
- **Demo mode** uses a simulated provider. Every answer is labelled "Simulated", and nothing leaves the server.

## Transport and browser hardening

- **CSP** with a per-request nonce and `strict-dynamic` for scripts. `frame-ancestors 'none'`, `object-src 'none'`, `base-uri 'self'`, `form-action 'self'`.
- **Headers.** HSTS in production, `X-Content-Type-Options`, `X-Frame-Options: DENY`, `Referrer-Policy`, a restrictive `Permissions-Policy`, and COOP. No `X-Powered-By`.
- **Profile photos** are served from RedSky (never third-party URLs). Their type is detected from bytes, and SVG is rejected.

## Logging, diagnostics and audit

- **Logs.** Structured JSON. Keys that can carry secrets or personal data (tokens, cookies, emails, assessment content) are redacted before writing.
- **Health.** `/api/health` reports coarse status only: database ok/unavailable, auth configured or not, data mode, and the commit prefix.
- **Audit.** The `audit_events` table records sign-ins (including denials), onboarding completion and restart, every Workstyle operation, confirmed AI actions and approvals.

## Database isolation from Twenty

RedSky uses its own PostgreSQL service and the `redsky` schema. The migration runner refuses any database containing Twenty's schemas or another application's tables, and it serializes concurrent deploys with an advisory lock. RedSky never queries Twenty's database; CRM data comes only through the authenticated REST adapter.

## Secrets

`.env*` (except `.env.example`), PDFs and key files are git-ignored and excluded from the Docker build context. Secrets live in Railway service variables and RSM's password manager. Losing `REDSKY_ENCRYPTION_KEY` makes stored Workstyle data unreadable by design.

## Documents

- **Who sees a document.** "Only me" documents are readable and changeable by their uploader alone; administrators included get nothing. "All RSM staff" documents are readable by anyone signed in, and only the uploader can retry or delete them (`document` in `src/server/security/access-policy.ts`). A document someone may not read answers 404, exactly like a missing one, for its metadata, text, original file and search hits.
- **Uploads are untrusted.** The type comes from the file's bytes, not its name or the browser's Content-Type: PDF, PNG, JPEG, TIFF, and Word, PowerPoint and Excel containers only. Files are capped at 50 MB, stored under a generated key, and read only by `redsky-ocr`, which refuses macros, encrypted files and archive bombs. Originals are always served as downloads (`Content-Disposition: attachment`, `nosniff`, a sandboxing CSP), never rendered in RedSky's origin. Extracted text is rendered as text; search highlights are built from markers, never from HTML.
- **Service calls.** `redsky-web` calls `redsky-ocr` with a service token over the private network, naming the tenant and the signed-in user after authorizing them itself. Events back from `redsky-ocr` are accepted only with a valid HMAC signature and a timestamp within five minutes, and each event id is applied once.
- **Audit.** Uploads, reads of extracted text, downloads, retries and deletions are audited with ids only, never file names or content. Logs never carry document text or search terms.
- **Deletion.** Deleting a document removes the text `redsky-ocr` extracted, then the original in the bucket, then RedSky's record; a failure stops before anything visible disappears. `_NOAI` files are stored but never read.

## Services behind the API

Services under `services/` are private: no public domain, reachable only on Railway's private network, and called only by the RedSky API, which authorizes the user first and passes the tenant and user with a service token ([`DECISIONS.md`](DECISIONS.md) 2 and 4). Each service has its own database login and cannot read RedSky's or Twenty's tables. Events they send back are HMAC-signed and timestamped. `redsky-ocr`'s security model is in [`services/ocr/README.md`](../services/ocr/README.md#security).
