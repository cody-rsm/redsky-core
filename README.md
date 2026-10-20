# RedSky

RSM Capital's internal operating system: a personalized workspace with a 9-step onboarding, Workstyle Intelligence, a customizable home dashboard and RedSky AI.

RedSky is the **only application staff use**. The rsm-crm Twenty deployment is the CRM's back end and system of record; only administrators open its screens. RedSky runs as its own service with its own database and reaches Twenty only through its API. See [`docs/CRM_INTEGRATION.md`](docs/CRM_INTEGRATION.md) for the plan and roadmap.

Production: `https://redsky.rsmcapital.com`.

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
| CRM | Read-only Twenty adapter with normalized models. Inactive until `TWENTY_API_URL` and `TWENTY_API_KEY` are set. Writing, editable record pages, mailbox connection and deals are the next roadmap steps ([`docs/CRM_INTEGRATION.md`](docs/CRM_INTEGRATION.md)). |

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

RedSky deploys to Railway from this repository's `Dockerfile` (see [`railway.json`](railway.json)) as `redsky-web`, with its own `redsky-postgres` service; the Twenty services are not touched. Click-by-click steps (including the `redsky.rsmcapital.com` domain and Entra sign-in), the variable list, the checklist and rollback are in [`docs/DEPLOYMENT.md`](docs/DEPLOYMENT.md).

## Documentation

- [`docs/DECISIONS.md`](docs/DECISIONS.md): decision record
- [`docs/CRM_INTEGRATION.md`](docs/CRM_INTEGRATION.md): RedSky in front, Twenty behind; one-system roadmap; market-data providers; leaving Twenty later
- [`docs/IMPLEMENTATION_PLAN.md`](docs/IMPLEMENTATION_PLAN.md): prototype audit, architecture, key decisions
- [`docs/ARCHITECTURE.md`](docs/ARCHITECTURE.md): code map, data flow, adding widgets, connectors and AI tools
- [`docs/SECURITY.md`](docs/SECURITY.md): authentication, authorization, Workstyle privacy, AI safeguards, audit
- [`docs/DEPLOYMENT.md`](docs/DEPLOYMENT.md): Railway deployment guide and checklist

## Branches

`main` is the production branch and `staging` the pre-production branch. Feature work happens on short-lived branches merged into `staging` first.
