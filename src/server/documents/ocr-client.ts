import 'server-only';
import { z } from 'zod';
import type { OcrConfig } from '@/server/config/env';

// Client for redsky-ocr's versioned API (services/ocr/README.md). RedSky authorizes the user first; every call
// then names the tenant and the user with the service token, and redsky-ocr trusts that decision.

const TIMEOUT_MS = 10_000;

export type OcrCaller = { tenantId: string; userId: string };

const statusSchema = z.enum(['uploaded', 'queued', 'processing', 'completed', 'failed', 'needs_review']);

const extractionSchema = z
  .object({
    id: z.string(),
    status: z.string(),
    engine: z.string().nullable(),
    pageCount: z.number().int().nullable(),
    error: z.object({ code: z.string(), message: z.string() }).nullable(),
  })
  .passthrough();

const documentSchema = z
  .object({
    id: z.string().uuid(),
    status: statusSchema,
    statusReason: z.string().nullable(),
    statusMessage: z.string().nullable(),
    noAi: z.boolean(),
    contentAvailable: z.boolean(),
    latestExtraction: extractionSchema.nullable(),
    currentExtraction: extractionSchema.nullable(),
    // redsky-ocr's clock, the same one that stamps its events' occurredAt.
    updatedAt: z.string().datetime({ offset: true }),
  })
  .passthrough();

const contentSchema = z.object({
  extractionId: z.string(),
  engine: z.string().nullable(),
  pageCount: z.number().int().nullable(),
  pages: z.array(z.object({ pageNumber: z.number().int(), method: z.string().nullable(), markdown: z.string().nullable(), text: z.string().nullable(), ocrConfidence: z.number().nullable() })),
});

const tablesSchema = z.object({
  tables: z.array(z.object({ index: z.number().int(), pageNumber: z.number().int().nullable(), cells: z.array(z.array(z.string())), caption: z.string().nullable() })),
});

const searchSchema = z.object({
  results: z.array(z.object({ documentId: z.string(), pageNumber: z.number().int(), snippet: z.string(), source: z.object({ system: z.string(), id: z.string() }) })),
});

export type OcrDocumentStatus = z.infer<typeof statusSchema>;
export type OcrDocument = z.infer<typeof documentSchema>;
export type OcrContent = z.infer<typeof contentSchema>;
export type OcrTables = z.infer<typeof tablesSchema>;
export type OcrSearchHit = z.infer<typeof searchSchema>['results'][number];

export class OcrError extends Error {
  constructor(
    public readonly kind: 'unreachable' | 'rejected' | 'not_found' | 'not_ready' | 'conflict' | 'invalid' | 'bad_response',
    message: string,
    public readonly code: string | null = null,
  ) {
    super(message);
  }
}

type FetchLike = typeof fetch;

export class OcrClient {
  constructor(
    private readonly config: OcrConfig,
    private readonly fetchImpl: FetchLike = fetch,
  ) {}

  register(caller: OcrCaller, input: { key: string; filename: string }): Promise<OcrDocument> {
    return this.call(caller, 'POST', '/api/v1/documents', documentSchema, { source: { system: 'storage', id: input.key }, filename: input.filename, engine: 'auto' });
  }

  get(caller: OcrCaller, id: string, timeoutMs = TIMEOUT_MS): Promise<OcrDocument> {
    return this.call(caller, 'GET', `/api/v1/documents/${id}`, documentSchema, undefined, timeoutMs);
  }

  content(caller: OcrCaller, id: string): Promise<OcrContent> {
    return this.call(caller, 'GET', `/api/v1/documents/${id}/content`, contentSchema);
  }

  tables(caller: OcrCaller, id: string): Promise<OcrTables> {
    return this.call(caller, 'GET', `/api/v1/documents/${id}/tables`, tablesSchema);
  }

  reprocess(caller: OcrCaller, id: string): Promise<OcrDocument> {
    return this.call(caller, 'POST', `/api/v1/documents/${id}/reprocess`, documentSchema, { engine: 'auto' });
  }

  async search(caller: OcrCaller, query: string, limit: number): Promise<OcrSearchHit[]> {
    const params = new URLSearchParams({ q: query, limit: String(limit) });
    return (await this.call(caller, 'GET', `/api/v1/search?${params}`, searchSchema)).results;
  }

  // Removes what redsky-ocr derived from the document; RedSky deletes the original itself.
  async delete(caller: OcrCaller, id: string): Promise<void> {
    try {
      await this.call(caller, 'DELETE', `/api/v1/documents/${id}`, null);
    } catch (error) {
      if (!(error instanceof OcrError && error.kind === 'not_found')) throw error;
    }
  }

  private async call<TSchema extends z.ZodType>(caller: OcrCaller, method: 'GET' | 'POST' | 'DELETE', path: string, schema: TSchema | null, body?: unknown, timeoutMs = TIMEOUT_MS): Promise<z.infer<TSchema>> {
    let response: Response;
    try {
      response = await this.fetchImpl(new URL(path, this.config.baseUrl), {
        method,
        headers: {
          Authorization: `Bearer ${this.config.serviceToken}`,
          'X-RedSky-Tenant-Id': caller.tenantId,
          'X-RedSky-User-Id': caller.userId,
          Accept: 'application/json',
          ...(body === undefined ? {} : { 'Content-Type': 'application/json' }),
        },
        body: body === undefined ? undefined : JSON.stringify(body),
        signal: AbortSignal.timeout(timeoutMs),
        cache: 'no-store',
        redirect: 'error',
      });
    } catch {
      throw new OcrError('unreachable', 'Text extraction did not respond');
    }
    if (response.ok) {
      if (!schema) return undefined as z.infer<TSchema>;
      const parsed = schema.safeParse(await response.json().catch(() => null));
      if (!parsed.success) throw new OcrError('bad_response', `Unexpected response from text extraction (${path.split('?')[0]})`);
      return parsed.data;
    }
    const code = await errorCode(response);
    if (response.status === 401 || response.status === 403) throw new OcrError('rejected', 'Text extraction rejected RedSky’s service token', code);
    if (response.status === 404) throw new OcrError('not_found', 'Text extraction has no such document', code);
    if (response.status === 409 && code === 'CONTENT_NOT_READY') throw new OcrError('not_ready', 'The text is not ready yet', code);
    if (response.status === 409) throw new OcrError('conflict', 'Text extraction is busy with this document', code);
    if (response.status === 422) throw new OcrError('invalid', 'Text extraction refused the request', code);
    throw new OcrError(response.status >= 500 ? 'unreachable' : 'bad_response', `Text extraction returned ${response.status}`, code);
  }
}

async function errorCode(response: Response): Promise<string | null> {
  const body = (await response.json().catch(() => null)) as { detail?: unknown } | null;
  const detail = body?.detail;
  if (detail && typeof detail === 'object' && 'code' in detail && typeof detail.code === 'string') return detail.code;
  return null;
}
