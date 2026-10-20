# RedSky — Implementation Plan & Architecture

Status: first release (onboarding + home). Source of truth for UI/UX: `prototype/` (the approved Claude Design package — `prototype/docs/SPEC.md`, `prototype/source/Main.dc.html`, `prototype/docs/screenshots/`).

This plan covers the web app's first release. The platform it belongs to (layers, services, repositories and the rules between them) is in [`ARCHITECTURE.md`](ARCHITECTURE.md#platform-structure) and [`DECISIONS.md`](DECISIONS.md).

## 1. Prototype audit

| Area | What the prototype has | Disposition |
|---|---|---|
| Styles | One stylesheet, CSS variables, light + dark (`prototype/design/prototype-styles.css`) | **Ported nearly verbatim** to `src/styles/design-system.css`; tokens exposed to Tailwind via `@theme` |
| Icons | 67 custom 24×24 stroke paths (`I` table) | **Reused** as the RedSky icon set (`src/components/ui/icon.tsx`) — they are the design; Lucide-compatible API |
| Onboarding | 9 steps, step rail, footer, validation, Workstyle sub-flow, Enter transition | **Rebuilt** as typed React, persisted server-side per user |
| Home | 13 widgets, tabs, customize mode (drag, resize, hide, move), library drawer, density, opens-to | **Rebuilt**; layout persisted per user |
| Overlays | Command palette, AI panel, meeting prep drawer, record preview, settings (7 tabs), quick create, confirm dialog, toasts, notifications, demo switcher | **Rebuilt** on accessible primitives (Radix Dialog / Popover / DropdownMenu) styled with prototype classes |
| Logic | `recommend`, `pack`, `orderLayout`, `wsApply`, palette builder, AI answer builder | **Ported** as pure, unit-tested functions |
| Data | All sample records in `prototype/data/sample-data.json` | **Isolated** in `src/demo/` and served only by the demo data provider |
| Simulated only | AI answers, assessment extraction, all connectors, drafts to Outlook, uploads, contact/opportunity creation | Simulation kept **only in demo mode** and labeled; production shows honest unavailable/empty states |
| Missing | Real auth, persistence, upload pipeline, AI provider, CRM access, logos for 9 connectors, licensed headline fonts | Built (auth, persistence, upload + text extraction, AI + CRM boundaries) or listed as open items |

## 2. Architecture

```
Browser (React 19 client components, TanStack Query, Zustand UI store)
   │  fetch /api/*  (same-origin, session cookie, Origin-checked mutations)
Next.js 16 App Router (Node runtime)
   ├─ proxy.ts                      CSP nonce, security headers, optimistic auth redirect
   ├─ app/login · app/onboarding/[step] · app/(workspace)/*   server components: session check, bootstrap data
   ├─ app/api/*                     route handlers → application services
   └─ src/server
        ├─ auth/        Entra ID (OIDC + PKCE, openid-client) · dev-only auth · sessions
        ├─ security/    access policy (RBAC + object-level), audit log, crypto
        ├─ http/        route wrapper: Origin check, session, rate limit, error mapping
        ├─ services/    profile, preferences, onboarding, tasks, workstyle, workspace, AI, confirm — Drizzle queries live here (RedSky DB only)
        ├─ data/        WorkspaceDataProvider → demo provider | production provider
        ├─ integrations/ CRM adapter interface → Twenty REST adapter (disabled until configured)
        └─ ai/          model provider (Anthropic | simulated) · prompts · context retrieval · tools
RedSky PostgreSQL (schema `redsky`, Drizzle migrations) — never Twenty's database
Twenty CRM (separate Railway service) — reached only via authenticated server-side REST adapter
```

### Key decisions

1. **Next.js 16 App Router, React 19, TypeScript strict, `output: 'standalone'`** for a small Docker image. Cache Components is left off: every view is per-user and authenticated, so it would add Suspense constraints without benefit. Next 17 is expected to make it mandatory — tracked as a follow-up.
2. **Styling = prototype stylesheet + Tailwind v4.** The prototype CSS is the design system (in `@layer components`); Tailwind supplies token-mapped utilities (`bg-sf`, `text-tx2`, …) for layout. Tailwind's preflight is intentionally **not** loaded so rendering matches the prototype exactly.
3. **shadcn/ui pattern, not shadcn defaults.** Accessible behavior comes from Radix primitives in `src/components/ui/*` (copy-in components, shadcn conventions); their look is the prototype's classes.
4. **Drizzle ORM + postgres.js.** SQL-first migrations in `drizzle/`, all tables in a dedicated `redsky` schema. The migration runner refuses to run against a database that contains Twenty's schemas or another app's marker.
5. **Auth:** Microsoft Entra ID via OIDC Authorization Code + PKCE (openid-client), tenant-restricted, server-side sessions (hashed opaque tokens in Postgres, `__Host-` cookie). Dev-only persona sign-in exists **only when `NODE_ENV !== 'production'`** — it cannot be enabled in a production build. With no Entra configuration, production serves a "sign-in not configured" page and all APIs return 401.
6. **Focus areas ≠ permissions.** The 9 onboarding "roles" are personalization (widgets, navigation emphasis). Access control uses access roles aligned with `redsky-twenty/RSM_ARCHITECTURE.md §12` (member/admin now; classification tiers and team/deal-wall hooks designed in).
7. **Explicit data modes.** `REDSKY_DATA_MODE=demo` serves the prototype's sample data, labeled everywhere. `production` never falls back to sample data: unconnected sources render designed empty states. RedSky-native data (profile, preferences, layout, onboarding, tasks, workstyle, AI conversations) is real in both modes.
8. **Workstyle Intelligence:** consent-gated PDF upload (type, size and magic-byte checks), real text extraction for text-based PDFs (`unpdf`), a heuristic TTI parser whose every value is shown for employee review, an honest unreadable/scanned state, manual entry, and explicit threshold rules for recommendations. The extracted profile is encrypted (AES-256-GCM) and readable only by its owner, every read is audited, and removal is a hard delete. The original PDF is not retained unless retention is explicitly enabled.
9. **AI:** provider interface with an Anthropic adapter (server-only key) and a simulated provider (demo mode only). Context retrieval is permission-scoped and limited to RedSky-native data that actually exists. Proposed actions are structured and executed only after explicit confirmation plus a server-side authorization check. Every confirmed action is audited and idempotent.
10. **Twenty boundary:** `CrmAdapter` with normalized `Contact/Company/Opportunity/Activity/Relationship` models. The Twenty REST adapter follows the fork's actual v2.44 API (`/rest/{plural}`, Bearer API key, cursor pagination), treats `rsm-core` custom fields as optional, and stays inactive until `TWENTY_API_URL` + `TWENTY_API_KEY` are set.

## 3. Build order (one codebase)

1. Foundation: config, design system, icons, primitives, catalogs, personalization engine + tests.
2. Data & security: schema, migrations + guard, env validation, auth, sessions, proxy/CSP, access policy, audit log, health.
3. App shell: sidebar, top bar, palette, AI panel, notifications, quick create, settings, theme, mobile nav, Esc layering.
4. Onboarding: 9 persisted steps, Workstyle pipeline, Enter transition.
5. Home: widget registry, 13 widgets, customization, drawers, People + Pipeline + module placeholders.
6. Integrations & AI: CRM adapter, AI providers, conversation persistence, confirmed actions.
7. Quality & deploy: Vitest, Playwright, typecheck, lint, build, Docker, Railway config, docs.

## 4. Credentials & decisions needed from RSM

| Item | Needed for |
|---|---|
| Entra app registration (tenant ID, client ID, client secret, redirect URI) | Real sign-in on any deployed environment |
| `ANTHROPIC_API_KEY` (approved, no-training terms) | Real RedSky AI answers |
| Twenty API URL + a dedicated API key with a scoped role | CRM-backed People/records |
| Official connector logos + brand-use permission | 9 monogram connectors |
| Legal review of Workstyle consent text and retention; TTI parsing licence | Workstyle in production |
| Naming: the Twenty deployment is itself branded "RedSky" (emails, tab title) | Avoid two products with the same name |
