import { randomUUID } from 'node:crypto';
import { eq, inArray } from 'drizzle-orm';
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import type { OcrCaller } from '@/server/documents/ocr-client';
import type { OcrEvent } from '@/server/documents/ocr-events';

// Runs the documents service against a real, migrated RedSky database (REDSKY_TEST_DATABASE_URL, as in CI), with
// the bucket and redsky-ocr replaced by in-memory fakes. Skipped without a database.
const databaseUrl = process.env.REDSKY_TEST_DATABASE_URL;
if (databaseUrl) {
  Object.assign(process.env, {
    REDSKY_DATABASE_URL: databaseUrl,
    REDSKY_TENANT_ID: 'rsm-test',
    DOCUMENTS_BUCKET: 'redsky-documents',
    DOCUMENTS_S3_ACCESS_KEY_ID: 'test',
    DOCUMENTS_S3_SECRET_ACCESS_KEY: 'test',
    OCR_URL: 'http://redsky-ocr.test',
    OCR_SERVICE_TOKEN: 't'.repeat(40),
  });
}

type FakeOcrDocument = { id: string; key: string; tenantId: string; status: string; statusReason: string | null; noAi: boolean; text: string; updatedAt: string };

const fakes = vi.hoisted(() => ({
  objects: new Map<string, Buffer>(),
  ocr: new Map<string, FakeOcrDocument>(),
  ocrDown: { value: false },
}));

vi.mock('@/server/documents/storage', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/server/documents/storage')>();
  class FakeStorage {
    async put(key: string, bytes: Buffer) {
      fakes.objects.set(key, bytes);
    }
    async get(key: string) {
      const bytes = fakes.objects.get(key);
      return bytes ? { body: new Blob([new Uint8Array(bytes)]).stream(), contentLength: bytes.length } : null;
    }
    async delete(key: string) {
      fakes.objects.delete(key);
    }
    async health() {
      return 'ok' as const;
    }
  }
  return { ...actual, S3DocumentStorage: FakeStorage };
});

vi.mock('@/server/documents/ocr-client', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/server/documents/ocr-client')>();
  const view = (document: FakeOcrDocument) => ({
    id: document.id,
    status: document.status,
    statusReason: document.statusReason,
    statusMessage: null,
    noAi: document.noAi,
    contentAvailable: document.status === 'completed',
    latestExtraction: null,
    currentExtraction: document.status === 'completed' ? { id: randomUUID(), status: 'completed', engine: 'tesseract', pageCount: 2, error: null } : null,
    updatedAt: document.updatedAt,
  });
  const owned = (caller: OcrCaller, id: string) => {
    const document = fakes.ocr.get(id);
    if (!document || document.tenantId !== caller.tenantId) throw new actual.OcrError('not_found', 'missing');
    return document;
  };
  class FakeOcr {
    async register(caller: OcrCaller, input: { key: string; filename: string }) {
      if (fakes.ocrDown.value) throw new actual.OcrError('unreachable', 'down');
      const existing = [...fakes.ocr.values()].find((document) => document.key === input.key);
      if (existing) return view(existing);
      const noAi = /_NOAI/i.test(input.filename);
      const document = { id: randomUUID(), key: input.key, tenantId: caller.tenantId, status: noAi ? 'uploaded' : 'queued', statusReason: noAi ? 'NO_AI_DOCUMENT' : null, noAi, text: '', updatedAt: new Date().toISOString() };
      fakes.ocr.set(document.id, document);
      return view(document);
    }
    async get(caller: OcrCaller, id: string) {
      return view(owned(caller, id));
    }
    async content(caller: OcrCaller, id: string) {
      const document = owned(caller, id);
      if (document.status !== 'completed') throw new actual.OcrError('not_ready', 'not ready', 'CONTENT_NOT_READY');
      return { extractionId: randomUUID(), engine: 'tesseract', pageCount: 1, pages: [{ pageNumber: 1, method: 'ocr', markdown: document.text, text: document.text, ocrConfidence: 91 }] };
    }
    async tables() {
      return { tables: [{ index: 0, pageNumber: 1, cells: [['Year', 'Revenue'], ['2026', '12.5']], caption: null }] };
    }
    async reprocess(caller: OcrCaller, id: string) {
      const document = owned(caller, id);
      Object.assign(document, { status: 'queued', statusReason: null, updatedAt: new Date().toISOString() });
      return view(document);
    }
    async search(caller: OcrCaller, query: string) {
      return [...fakes.ocr.values()]
        .filter((document) => document.tenantId === caller.tenantId && document.text.includes(query))
        .map((document) => ({ documentId: document.id, pageNumber: 1, snippet: `…<<${query}>>…`, source: { system: 'storage', id: document.key } }));
    }
    async delete(caller: OcrCaller, id: string) {
      if (fakes.ocr.get(id)?.tenantId === caller.tenantId) fakes.ocr.delete(id);
    }
  }
  return { ...actual, OcrClient: FakeOcr };
});

const PDF = Buffer.from('%PDF-1.7\n% test document\n');

describe.skipIf(!databaseUrl)('document service (database)', async () => {
  const { getDb } = await import('@/server/db/client');
  const { documents, users, ocrEventReceipts } = await import('@/server/db/schema');
  const service = await import('@/server/services/document-service');
  const { AccessDeniedError } = await import('@/server/security/access-policy');
  const { HttpError } = await import('@/server/http/errors');

  const userIds: string[] = [];
  const eventIds: string[] = [];
  const actors = { owner: { userId: '', accessRole: 'member' as const, teamIds: [] }, colleague: { userId: '', accessRole: 'member' as const, teamIds: [] } };

  const upload = (actor = actors.owner, name = 'memo.pdf', visibility: 'private' | 'firm' = 'private') => service.uploadDocument(actor, { name, bytes: PDF }, { visibility, relatedLabel: 'Halcyon Robotics' }, 'test-request');
  const ocrIdOf = async (id: string) => (await getDb().select().from(documents).where(eq(documents.id, id)))[0]?.ocrDocumentId ?? '';
  const event = (ocrDocumentId: string, status: OcrEvent['document']['status'], occurredAt: Date, overrides: Partial<OcrEvent> = {}): OcrEvent => {
    const id = randomUUID();
    eventIds.push(id);
    return {
      id,
      type: status === 'failed' ? 'document.failed' : 'document.completed',
      occurredAt: occurredAt.toISOString(),
      tenantId: 'rsm-test',
      document: { id: ocrDocumentId, source: { system: 'storage', id: 'documents/x/y.pdf' }, status, statusReason: status === 'failed' ? 'CORRUPT_FILE' : null },
      extractionId: randomUUID(),
      ...overrides,
    };
  };
  const complete = (ocrDocumentId: string, text: string) => {
    const document = fakes.ocr.get(ocrDocumentId);
    if (document) Object.assign(document, { status: 'completed', text, updatedAt: new Date().toISOString() });
  };

  beforeAll(async () => {
    for (const role of ['owner', 'colleague'] as const) {
      const [user] = await getDb()
        .insert(users)
        .values({ authProvider: 'dev', authSubject: `documents-test-${randomUUID()}`, email: `${role}@example.com`, displayName: role === 'owner' ? 'Olivia Owner' : 'Colin Colleague' })
        .returning();
      if (!user) throw new Error('user insert failed');
      actors[role].userId = user.id;
      userIds.push(user.id);
    }
  });

  beforeEach(() => {
    fakes.ocrDown.value = false;
  });

  afterAll(async () => {
    if (eventIds.length > 0) await getDb().delete(ocrEventReceipts).where(inArray(ocrEventReceipts.eventId, eventIds));
    await getDb().delete(documents).where(inArray(documents.ownerId, userIds));
    await getDb().delete(users).where(inArray(users.id, userIds));
    await (globalThis as unknown as { redskyDb?: { sql: { end: () => Promise<void> } } }).redskyDb?.sql.end();
  });

  it('stores an upload in the bucket and hands it to redsky-ocr', async () => {
    const document = await upload();
    expect(document).toMatchObject({ fileName: 'memo.pdf', status: 'queued', visibility: 'private', relatedLabel: 'Halcyon Robotics', canChange: true, owner: { isYou: true } });
    const [row] = await getDb().select().from(documents).where(eq(documents.id, document.id));
    expect(row?.storageKey).toMatch(/^documents\/[0-9a-f-]{36}\/memo\.pdf$/);
    expect(fakes.objects.get(row?.storageKey ?? '')).toEqual(PDF);
    expect(fakes.ocr.get(row?.ocrDocumentId ?? '')?.tenantId).toBe('rsm-test');
  });

  it('refuses files that are not documents, before storing anything', async () => {
    const before = fakes.objects.size;
    await expect(service.uploadDocument(actors.owner, { name: 'notes.pdf', bytes: Buffer.from('just text') }, { visibility: 'private', relatedLabel: '' }, 'r')).rejects.toBeInstanceOf(HttpError);
    expect(fakes.objects.size).toBe(before);
  });

  it('hides "Only me" documents from colleagues, as if they did not exist', async () => {
    const document = await upload();
    const listed = await service.listDocuments(actors.colleague, null);
    expect(listed.status === 'ok' && listed.documents.some((row) => row.id === document.id)).toBe(false);
    await expect(service.getDocument(actors.colleague, document.id)).rejects.toMatchObject({ status: 404 });
    await expect(service.openOriginal(actors.colleague, document.id, 'r')).rejects.toMatchObject({ status: 404 });
  });

  it('shares "All RSM staff" documents for reading, while only the owner deletes them', async () => {
    const document = await upload(actors.owner, 'Board update.pdf', 'firm');
    const listed = await service.listDocuments(actors.colleague, null);
    const row = listed.status === 'ok' ? listed.documents.find((candidate) => candidate.id === document.id) : undefined;
    expect(row).toMatchObject({ canChange: false, owner: { name: 'Olivia Owner', isYou: false } });
    await expect(service.deleteDocument(actors.colleague, document.id, 'r')).rejects.toBeInstanceOf(AccessDeniedError);

    const ocrId = await ocrIdOf(document.id);
    const [stored] = await getDb().select().from(documents).where(eq(documents.id, document.id));
    await service.deleteDocument(actors.owner, document.id, 'r');
    expect(fakes.ocr.has(ocrId)).toBe(false);
    expect(fakes.objects.has(stored?.storageKey ?? '')).toBe(false);
    await expect(service.getDocument(actors.owner, document.id)).rejects.toMatchObject({ status: 404 });
  });

  it('applies redsky-ocr events once, and never lets an older one win', async () => {
    const document = await upload();
    const ocrId = await ocrIdOf(document.id);
    const later = new Date(Date.now() + 60_000);
    const completed = event(ocrId, 'completed', later);
    expect(await service.applyOcrEvent(completed)).toBe('applied');
    expect(await service.applyOcrEvent(completed)).toBe('duplicate');
    expect((await service.getDocument(actors.owner, document.id)).status).toBe('completed');

    await service.applyOcrEvent(event(ocrId, 'failed', new Date(later.getTime() - 30_000)));
    expect((await service.getDocument(actors.owner, document.id)).status).toBe('completed');

    expect(await service.applyOcrEvent(event(ocrId, 'failed', later, { tenantId: 'another-tenant' }))).toBe('ignored');
    expect(await service.applyOcrEvent(event(randomUUID(), 'completed', later))).toBe('ignored');
  });

  it('keeps a file whose hand-off failed, and hands it over on a later look', async () => {
    fakes.ocrDown.value = true;
    const document = await upload();
    expect(document.status).toBe('registering');
    expect(document.statusMessage).toMatch(/Text extraction starts/);
    fakes.ocrDown.value = false;
    const listed = await service.listDocuments(actors.owner, null);
    const row = listed.status === 'ok' ? listed.documents.find((candidate) => candidate.id === document.id) : undefined;
    expect(row?.status).toBe('queued');
  });

  it('returns the text and tables once redsky-ocr has read the file', async () => {
    const document = await upload();
    expect(await service.getDocumentContent(actors.owner, document.id, 'r')).toEqual({ status: 'not_ready' });
    const ocrId = await ocrIdOf(document.id);
    complete(ocrId, 'Quarterly revenue grew.');
    const refreshed = await service.getDocument(actors.owner, document.id);
    expect(refreshed).toMatchObject({ status: 'completed', pageCount: 2 });
    const content = await service.getDocumentContent(actors.owner, document.id, 'r');
    expect(content).toMatchObject({ status: 'ready', pages: [{ pageNumber: 1, text: 'Quarterly revenue grew.', method: 'ocr' }], tables: [{ cells: [['Year', 'Revenue'], ['2026', '12.5']] }] });
  });

  it('stores _NOAI files without reading them', async () => {
    const document = await upload(actors.owner, 'Side letter_NOAI.pdf');
    expect(document).toMatchObject({ status: 'uploaded', noAi: true });
    expect(await service.getDocumentContent(actors.owner, document.id, 'r')).toEqual({ status: 'no_ai' });
  });

  it('searches only the documents the person may open', async () => {
    const privateDocument = await upload(actors.owner, 'private.pdf', 'private');
    const firmDocument = await upload(actors.owner, 'shared.pdf', 'firm');
    complete(await ocrIdOf(privateDocument.id), 'turbine maintenance schedule');
    complete(await ocrIdOf(firmDocument.id), 'turbine purchase agreement');
    await service.getDocument(actors.owner, privateDocument.id);
    await service.getDocument(actors.owner, firmDocument.id);

    const mine = await service.searchDocuments(actors.owner, 'turbine');
    expect(mine.results.map((result) => result.documentId).sort()).toEqual([privateDocument.id, firmDocument.id].sort());
    const theirs = await service.searchDocuments(actors.colleague, 'turbine');
    expect(theirs.results).toEqual([{ documentId: firmDocument.id, fileName: 'shared.pdf', pageNumber: 1, snippet: '…<<turbine>>…' }]);
  });

  it('retries a file redsky-ocr could not read', async () => {
    const document = await upload();
    const ocrId = await ocrIdOf(document.id);
    const fake = fakes.ocr.get(ocrId);
    if (fake) Object.assign(fake, { status: 'failed', statusReason: 'ENGINE_FAILED', updatedAt: new Date().toISOString() });
    expect((await service.getDocument(actors.owner, document.id)).status).toBe('failed');
    await expect(service.retryDocument(actors.colleague, document.id, 'r')).rejects.toMatchObject({ status: 404 });
    expect((await service.retryDocument(actors.owner, document.id, 'r')).status).toBe('queued');
  });
});
