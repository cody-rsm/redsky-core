# CLAUDE.md

`cody-rsm/redsky-core` (formerly `cody-rsm/RedSky`) is the RedSky platform, RSM Capital's internal operating system: the Next.js web app and API at the root, and services under `services/`. Twenty CRM is a separate system in `cody-rsm/redsky-twenty` (formerly `cody-rsm/rsm-crm`) that RedSky replaces one area at a time.

Read [`docs/ARCHITECTURE.md`](docs/ARCHITECTURE.md#platform-structure) (platform structure) before structural work, and [`docs/DECISIONS.md`](docs/DECISIONS.md) before changing anything it records. Match the surrounding code: adjacent files beat any rule written here.

## The structure we want

Decided ([`docs/DECISIONS.md`](docs/DECISIONS.md) 1 to 5). Don't work around these; if a task seems to need an exception, stop and ask.

1. **One owner per record type.** Twenty owns CRM records (companies, people, opportunities and what hangs off them) until an area moves. RedSky owns its workspace data and documents. Never build a two-way sync between RedSky and Twenty, and never copy Twenty records into a second writable store. Moving an area means: build it in RedSky, migrate, switch writes, make Twenty read-only for it.
2. **One sign-in, permissions where the record lives.** Entra ID for both systems. The RedSky API reads Twenty as the signed-in user so Twenty's permissions and deal walls apply. Don't add code that reads Twenty with an all-access key and re-implements its permissions in RedSky. The current shared `TWENTY_API_KEY` is a known gap (decision 7), not a pattern to copy. RedSky's own permissions live in `src/server/security/access-policy.ts` only.
3. **Documents in RedSky storage.** Uploads go to the `redsky-documents` bucket under `documents/<uuid>/<filename>`. SharePoint stays the deal-system home and is a source, not something to copy. Extracted text, chunks and embeddings stay in Postgres.
4. **HTTP contracts, no shared queues.** Services expose versioned HTTP APIs (`/api/v1/...`) and send HMAC-signed events to the RedSky API. No Redis or BullMQ queue shared between TypeScript and Python. Services are private; the browser calls only the RedSky API. Each service owns its database or schema; nothing reads another service's tables, and nothing reads Twenty's database.
5. **Two repositories.** Platform code goes here. Only what must live inside Twenty while it owns CRM records goes in `redsky-twenty`.

Staff work only in RedSky (decision 9): build CRM features staff need in RedSky's UI over the Twenty adapter, never as Twenty screens for staff.

Build order: the RedSky API, frontend, Documents and identity first.

## Where things go

| Adding | Put it in |
|---|---|
| UI | `src/app`, `src/components`; the prototype in `prototype/` is the design source of truth |
| An endpoint the frontend calls | `src/app/api` through `authedRoute`; logic in `src/server/services` |
| A RedSky-owned table | `src/server/db/schema.ts` (schema `redsky`), then `npm run db:generate` and commit the SQL in `drizzle/` |
| A data source | `src/server/integrations/<name>/`, behind a normalized interface like `crm/` |
| Heavy or non-TypeScript compute | A new `services/<name>/` with its own Dockerfile, database, versioned API, README and `.github/workflows/<name>.yml`, following `services/ocr` |
| Documents in the web app | `src/server/services/document-service.ts` and `src/server/documents/` (bucket, OCR client, event check); UI in `src/components/documents` |
| Document extraction | `services/ocr` (`redsky-ocr`, Python) |

## Commands

```bash
npm ci
npm run lint && npm run typecheck && npm test   # what CI runs first (.github/workflows/ci.yml)
npm run build                                   # production build
npm run test:e2e                                # Playwright
npm run db:migrate                              # needs REDSKY_DATABASE_URL; refuses Twenty's database

# services/ocr (Python 3.12, Tesseract installed)
cd services/ocr
uv venv -p 3.12 .venv && VIRTUAL_ENV=$PWD/.venv uv pip sync requirements-dev.lock
VIRTUAL_ENV=$PWD/.venv uv pip install --no-deps -e .
REDSKY_OCR_TEST_DATABASE_URL=postgresql://postgres@127.0.0.1:5432/postgres .venv/bin/pytest
```

## Rules

- `main` is production and `staging` pre-production. Work on a feature branch and merge into `staging` first.
- Never commit secrets, `.env` files or real documents (`*.pdf` is ignored on purpose; OCR tests generate synthetic files).
- Never connect to Twenty's database, and never point a RedSky migration at it.
- `services/ocr`: no Chinese-developed OCR engines or models and no outside document-processing services. `policy.py` refuses RapidOCR, PaddleOCR, EasyOCR, Qwen utilities, ModelScope, MinerU and DeepSeek-OCR at start-up. Install `docling-slim` with named extras, never `docling`. Regenerate the hashed lock files with the `uv pip compile` commands in the service README, never by hand.
- Logs carry ids, codes and timings, never document content, tokens or search terms.
- Don't claim something works without running it. Say what was tested and what was not.
