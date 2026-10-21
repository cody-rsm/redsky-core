# RedSky

RSM Capital's internal operating system: a personalized workspace with a 9-step onboarding, Workstyle Intelligence, a customizable home dashboard and RedSky AI.

RedSky is the **only application staff use**. The `redsky-twenty` deployment of Twenty is the CRM's back end and owns CRM records until each area moves to RedSky; only administrators open its screens. RedSky runs as its own services with its own database and reaches Twenty only through its API. See [`docs/CRM_INTEGRATION.md`](docs/CRM_INTEGRATION.md) for the plan and roadmap.

Production: `https://redsky.rsmcapital.com`.

This repository is `cody-rsm/redsky-core` (formerly `cody-rsm/RedSky`). It holds the RedSky platform: the web app and API at the root, and services under [`services/`](services/). Twenty CRM lives in `cody-rsm/redsky-twenty` (formerly `cody-rsm/rsm-crm`).

## Platform structure

RedSky is built as nine layers, from UX down to hosting, with Twenty CRM beside them as a replaceable connected system that RedSky takes over one area at a time. Four rules hold it together ([`docs/DECISIONS.md`](docs/DECISIONS.md) 1 to 4):

1. **One owner per record type.** Twenty owns CRM records, deals included; RedSky owns its workspace data and documents. Never sync two ways.
2. **One sign-in, permissions where the record lives.** Entra ID for both systems. The RedSky API reads and writes Twenty as each signed-in person through Twenty's OAuth, so Twenty's permissions and deal walls apply. No all-access key with Twenty's permissions re-implemented in RedSky.
3. **Documents in RedSky storage.** Uploads go to RedSky's own bucket; SharePoint stays the deal-system home. Extracted text and embeddings stay in Postgres.
4. **HTTP contracts, no shared queues.** Services such as `redsky-ocr` expose versioned HTTP APIs and send signed events to the RedSky API. They are private; the frontend calls only the RedSky API.

The layer map, services, where new work goes and the known gaps are in [`docs/ARCHITECTURE.md`](docs/ARCHITECTURE.md#platform-structure).

| Path | What | Railway service |
|---|---|---|
| `/` | The RedSky web app: frontend and RedSky API (Next.js) | `redsky-web` |
| [`services/ocr`](services/ocr/) | `redsky-ocr`: self-hosted document OCR and extraction (Python, Docling and Tesseract) | `redsky-ocr` |

The approved Claude Design prototype in [`prototype/`](prototype/) is the source of truth for the UI. This app reproduces it as production code.

## What's in this release

| Area | Status |
|---|---|
| Sign-in | Microsoft Entra ID (OIDC + PKCE, single tenant). Development-only persona sign-in that cannot exist in a production build. |
| Onboarding | All 9 steps, saved per employee on the server. A refresh or a later visit resumes on the same step. |
| Workstyle Intelligence | Consent-gated PDF upload, real text extraction, a heuristic TTI parser whose results the employee reviews and corrects, manual entry, rule-based suggestions (accept, customize, dismiss), sharing switches with separate consent, and hard delete. Data is encrypted, readable only by its owner, and every read is audited. |
| Home | Daily Brief and 12 more widgets, 5 tabs, customization (drag, keyboard move, resize, hide, widget library, density, opens-to), all saved per employee. |
| Workspace | Command palette, RedSky AI panel, meeting prep and record drawers, quick create, notifications, Settings (7 tabs), People, Pipeline and roadmap module pages, light/dark themes. |
| AI | Anthropic provider when configured, otherwise "not configured". Demo mode uses the prototype's simulated answers, labelled as simulated. Proposed actions run only after explicit confirmation and server-side authorization. |
| CRM | Read-only Twenty adapter with normalized models, used as each person: they connect once through Twenty's OAuth (People or Settings › Connected apps), and RedSky reads Twenty with their own token. Inactive until the OAuth settings are configured ([`docs/DEPLOYMENT.md`](docs/DEPLOYMENT.md) §10). Writing, editable record pages, mailbox setup and deals are the next roadmap steps ([`docs/CRM_INTEGRATION.md`](docs/CRM_INTEGRATION.md)). |
| Documents | Upload PDFs, scans, photos and Office files; RedSky stores them in its own bucket and reads them with `redsky-ocr` ([`services/ocr`](services/ocr/)). Status, extracted text and tables, full-text search, download, delete, and sharing as "Only me" or "All RSM staff". Deployed for files uploaded in RedSky (stage 1); Twenty attachments are stage 2 ([`docs/DEPLOYMENT.md`](docs/DEPLOYMENT.md) §13). |

### Data modes

- `REDSKY_DATA_MODE=demo` serves the prototype's sample records, labelled "Sample data" everywhere, and adds the demo profile switcher.
- `production` never shows sample data. Sources that aren't connected yet render the designed "not connected" state.

RedSky's own data (profile, preferences, layout, onboarding, tasks, Workstyle, AI conversations) is real in both modes.

## Stack

Next.js 16 (App Router, standalone output), React 19, TypeScript (strict), Tailwind CSS v4 plus the ported prototype stylesheet, Radix primitives (shadcn pattern), TanStack Query, Zustand, React Hook Form + Zod, Drizzle ORM on PostgreSQL, openid-client, the Anthropic SDK, `unpdf`, Vitest + Testing Library, and Playwright.

## Local development

Requirements: Node 22.12 or later, and PostgreSQL 14 or later. Use a database dedicated to RedSky.

```bash
npm ci
cp .env.example .env.local          # defaults: demo data, development sign-in
createdb redsky_dev                 # or any empty database; set REDSKY_DATABASE_URL to it
npm run db:migrate                  # applies drizzle/ migrations (refuses Twenty's database)
npm run dev                         # http://localhost:3000, then pick a demo profile
```

| Command | Purpose |
|---|---|
| `npm run dev` | Development server |
| `npm run build` / `npm start` | Production build: Next standalone output plus `dist/migrate.mjs` |
| `npm run lint` / `npm run typecheck` | ESLint / `tsc --noEmit` |
| `npm test` | Unit and component tests (Vitest) |
| `npm run test:e2e` | End-to-end tests (Playwright; starts `npm run dev` unless `E2E_BASE_URL` is set) |
| `npm run db:generate` | Generate a migration after editing `src/server/db/schema.ts` |
| `npm run db:migrate` | Apply migrations to `REDSKY_DATABASE_URL` |

To run the database-backed migration guard tests, set `REDSKY_TEST_DATABASE_URL` to a migrated RedSky database and `REDSKY_TEST_TWENTY_DECOY_URL` to a database containing `core` and `metadata` schemas. Without those variables the tests are skipped.

## Deployment

RedSky deploys to Railway from this repository's `Dockerfile` (see [`railway.json`](railway.json)) as `redsky-web`, with its own `redsky-postgres` service; the Twenty services are not touched. `redsky-ocr` is a separate Railway service built from `services/ocr`, with the `redsky-documents` bucket. Click-by-click steps (including the `redsky.rsmcapital.com` domain, Entra sign-in and Documents), the variable list, the checklist and rollback are in [`docs/DEPLOYMENT.md`](docs/DEPLOYMENT.md).

## Documentation

- [`docs/ARCHITECTURE.md`](docs/ARCHITECTURE.md): platform structure (layers, services, rules, where new work goes), then the web app's code map, data flow, and how to add widgets, connectors and AI tools
- [`docs/DECISIONS.md`](docs/DECISIONS.md): platform decisions and open questions
- [`docs/CRM_INTEGRATION.md`](docs/CRM_INTEGRATION.md): RedSky in front, Twenty behind; one-system roadmap; market-data providers; moving areas out of Twenty
- [`docs/IMPLEMENTATION_PLAN.md`](docs/IMPLEMENTATION_PLAN.md): prototype audit and the web app's key decisions
- [`docs/SECURITY.md`](docs/SECURITY.md): authentication, authorization, Workstyle privacy, AI safeguards, audit
- [`docs/DEPLOYMENT.md`](docs/DEPLOYMENT.md): Railway deployment guide and checklist
- [`services/ocr/README.md`](services/ocr/README.md): `redsky-ocr` design, API, events and security
- [`CLAUDE.md`](CLAUDE.md): instructions for coding agents working in this repository

## Branches

`main` is the production branch and `staging` the pre-production branch. Feature work happens on short-lived branches merged into `staging` first.
