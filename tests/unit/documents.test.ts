import { describe, expect, it, vi } from 'vitest';
import { documentStatusMessage, validateDocumentFile } from '@/features/documents/catalog';
import { parseConfig } from '@/server/config/env';
import { detectDocumentType, displayFileName, storageKeyFor } from '@/server/documents/files';
import { OcrClient, OcrError } from '@/server/documents/ocr-client';
import { signOcrEvent, verifyOcrEvent } from '@/server/documents/ocr-events';
import { authorize, type Actor } from '@/server/security/access-policy';

const SECRET = 'e'.repeat(64);
const NOW = Date.parse('2026-10-20T14:00:00Z');

// Shaped like redsky-ocr's repository.add_event payload.
const EVENT = {
  id: 'a93afdc8-8049-4185-bab7-287f5a794c6c',
  type: 'document.completed',
  document: { id: '53944ac0-e85f-49a2-bed1-e837ca6c747b', source: { id: 'documents/0b7c/memo.pdf', system: 'storage' }, status: 'completed', statusReason: null },
  tenantId: 'rsm',
  occurredAt: '2026-10-20T13:59:51.529572+00:00',
  extractionId: '29a3a551-c2b5-416b-92bb-fb5df02f8187',
};

function signed(payload: unknown = EVENT, timestamp = String(NOW)) {
  const body = JSON.stringify(payload);
  return { body, headers: { timestamp, signature: signOcrEvent(SECRET, timestamp, body), eventId: EVENT.id } };
}

describe('verifyOcrEvent', () => {
  it('accepts a correctly signed, fresh event', () => {
    const { body, headers } = signed();
    const result = verifyOcrEvent(SECRET, body, headers, NOW);
    expect(result).toMatchObject({ ok: true, event: { id: EVENT.id, type: 'document.completed' } });
  });

  it('rejects a changed body, the wrong secret and a missing signature', () => {
    const { body, headers } = signed();
    expect(verifyOcrEvent(SECRET, body.replace('completed', 'failed'), headers, NOW)).toEqual({ ok: false, reason: 'signature' });
    expect(verifyOcrEvent('f'.repeat(64), body, headers, NOW)).toEqual({ ok: false, reason: 'signature' });
    expect(verifyOcrEvent(SECRET, body, { ...headers, signature: null }, NOW)).toEqual({ ok: false, reason: 'signature' });
    expect(verifyOcrEvent(SECRET, body, { ...headers, signature: 'zz' }, NOW)).toEqual({ ok: false, reason: 'signature' });
  });

  it('rejects replays older than five minutes, and timestamps from the future', () => {
    const old = signed(EVENT, String(NOW - 6 * 60_000));
    expect(verifyOcrEvent(SECRET, old.body, old.headers, NOW)).toEqual({ ok: false, reason: 'stale' });
    const future = signed(EVENT, String(NOW + 6 * 60_000));
    expect(verifyOcrEvent(SECRET, future.body, future.headers, NOW)).toEqual({ ok: false, reason: 'stale' });
  });

  it('rejects signed payloads that are not events, or whose id disagrees with the header', () => {
    const notAnEvent = signed({ hello: 'world' });
    expect(verifyOcrEvent(SECRET, notAnEvent.body, notAnEvent.headers, NOW)).toEqual({ ok: false, reason: 'malformed' });
    const { body, headers } = signed();
    expect(verifyOcrEvent(SECRET, body, { ...headers, eventId: '00000000-0000-0000-0000-000000000000' }, NOW)).toEqual({ ok: false, reason: 'malformed' });
  });
});

describe('document files', () => {
  it('detects types from the bytes, not the name', () => {
    expect(detectDocumentType(Buffer.from('%PDF-1.7\n'), 'scan.png')).toEqual({ mime: 'application/pdf', extension: 'pdf' });
    expect(detectDocumentType(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0]), 'x')?.mime).toBe('image/png');
    expect(detectDocumentType(Buffer.from([0xff, 0xd8, 0xff, 0xe0]), 'x')?.mime).toBe('image/jpeg');
    expect(detectDocumentType(Buffer.from([0x49, 0x49, 0x2a, 0x00]), 'x')?.mime).toBe('image/tiff');
    expect(detectDocumentType(Buffer.from('plain text'), 'notes.pdf')).toBeNull();
  });

  it('accepts ZIP containers only as Word, PowerPoint or Excel files', () => {
    const zip = Buffer.from([0x50, 0x4b, 0x03, 0x04, 0]);
    expect(detectDocumentType(zip, 'Board update.DOCX')?.extension).toBe('docx');
    expect(detectDocumentType(zip, 'model.xlsx')?.extension).toBe('xlsx');
    expect(detectDocumentType(zip, 'macros.docm')).toBeNull();
    expect(detectDocumentType(zip, 'archive.zip')).toBeNull();
  });

  it('keeps a readable name without folders or control characters', () => {
    expect(displayFileName('C:\\Users\\me\\Q3 memo.pdf')).toBe('Q3 memo.pdf');
    expect(displayFileName('../../etc/passwd')).toBe('passwd');
    expect(displayFileName('a\u0000b\u0007.pdf')).toBe('ab.pdf');
    expect(displayFileName('   ')).toBe('document');
    const long = displayFileName(`${'x'.repeat(300)}.pdf`);
    expect(long).toHaveLength(200);
    expect(long.endsWith('.pdf')).toBe(true);
  });

  it('builds bucket keys redsky-ocr accepts', () => {
    // redsky-ocr's sources.STORAGE_KEY and its documents/ prefix.
    const allowed = /^documents\/[A-Za-z0-9!_.*'()/-]{1,1000}$/;
    for (const name of ['Résumé – final (v2).pdf', '季度报告.pdf', '...pdf', 'a/b.pdf']) {
      const key = storageKeyFor(name, { mime: 'application/pdf', extension: 'pdf' });
      expect(key).toMatch(allowed);
      expect(key.split('/')).toHaveLength(3);
      expect(key).not.toContain('..');
    }
    expect(storageKeyFor('Résumé – final.pdf', { mime: 'application/pdf', extension: 'pdf' })).toMatch(/\/Resume-final\.pdf$/);
  });

  it('checks size and type before uploading', () => {
    expect(validateDocumentFile({ name: 'a.pdf', size: 0 })).toMatch(/empty/);
    expect(validateDocumentFile({ name: 'a.pdf', size: 51 * 1024 * 1024 })).toMatch(/50 MB/);
    expect(validateDocumentFile({ name: 'a.exe', size: 10 })).toMatch(/PDF, Word/);
    expect(validateDocumentFile({ name: 'a.TIFF', size: 10 })).toBeNull();
  });

  it('words redsky-ocr error codes for people', () => {
    expect(documentStatusMessage('failed', 'ENCRYPTED_FILE')).toMatch(/password/);
    expect(documentStatusMessage('uploaded', 'NO_AI_DOCUMENT')).toMatch(/_NOAI/);
    expect(documentStatusMessage('completed', null)).toBeNull();
  });
});

describe('document access', () => {
  const owner: Actor = { userId: 'u1', accessRole: 'member', teamIds: [] };
  const colleague: Actor = { userId: 'u2', accessRole: 'member', teamIds: [] };
  const admin: Actor = { userId: 'a1', accessRole: 'admin', teamIds: [] };

  it('keeps "Only me" documents to their owner, administrators included', () => {
    const resource = { type: 'document', ownerId: 'u1', visibility: 'private' } as const;
    expect(authorize(owner, 'read', resource).allowed).toBe(true);
    expect(authorize(owner, 'delete', resource).allowed).toBe(true);
    expect(authorize(colleague, 'read', resource).allowed).toBe(false);
    expect(authorize(admin, 'read', resource).allowed).toBe(false);
  });

  it('lets everyone read "All RSM staff" documents but only the owner change them', () => {
    const resource = { type: 'document', ownerId: 'u1', visibility: 'firm' } as const;
    expect(authorize(colleague, 'read', resource).allowed).toBe(true);
    expect(authorize(colleague, 'delete', resource).allowed).toBe(false);
    expect(authorize(colleague, 'write', resource).allowed).toBe(false);
    expect(authorize(owner, 'delete', resource).allowed).toBe(true);
  });
});

describe('OcrClient', () => {
  const config = { baseUrl: new URL('http://redsky-ocr.railway.internal:8080'), serviceToken: 't'.repeat(40), eventsSecret: null };
  const caller = { tenantId: 'rsm', userId: 'user-1' };
  const remote = {
    id: '53944ac0-e85f-49a2-bed1-e837ca6c747b',
    status: 'queued',
    statusReason: null,
    statusMessage: null,
    noAi: false,
    contentAvailable: false,
    latestExtraction: null,
    currentExtraction: null,
    updatedAt: '2026-10-20T13:59:51.529572+00:00',
    sourceMetadata: {},
  };
  const reply = (status: number, body: unknown) => new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } });

  it('registers a stored document as the RedSky API, naming the tenant and the user', async () => {
    const fetchImpl = vi.fn(async () => reply(202, remote));
    const document = await new OcrClient(config, fetchImpl).register(caller, { key: 'documents/1/memo.pdf', filename: 'Memo.pdf' });
    expect(document.status).toBe('queued');
    const [url, init] = fetchImpl.mock.calls[0] as unknown as [URL, RequestInit];
    expect(url.toString()).toBe('http://redsky-ocr.railway.internal:8080/api/v1/documents');
    expect(init.headers).toMatchObject({ Authorization: `Bearer ${'t'.repeat(40)}`, 'X-RedSky-Tenant-Id': 'rsm', 'X-RedSky-User-Id': 'user-1' });
    expect(JSON.parse(String(init.body))).toEqual({ source: { system: 'storage', id: 'documents/1/memo.pdf' }, filename: 'Memo.pdf', engine: 'auto' });
  });

  it('maps redsky-ocr errors to typed kinds', async () => {
    const kindFor = async (response: Response | Error) => {
      const fetchImpl = vi.fn(async () => {
        if (response instanceof Error) throw response;
        return response;
      });
      return new OcrClient(config, fetchImpl).content(caller, remote.id).catch((error: OcrError) => error.kind);
    };
    expect(await kindFor(reply(409, { detail: { code: 'CONTENT_NOT_READY', status: 'queued' } }))).toBe('not_ready');
    expect(await kindFor(reply(404, { detail: 'Document not found.' }))).toBe('not_found');
    expect(await kindFor(reply(401, { detail: 'The token was rejected.' }))).toBe('rejected');
    expect(await kindFor(reply(503, { detail: 'down' }))).toBe('unreachable');
    expect(await kindFor(new TypeError('fetch failed'))).toBe('unreachable');
    expect(await kindFor(reply(200, { unexpected: true }))).toBe('bad_response');
  });

  it('treats deleting an already deleted document as done', async () => {
    const fetchImpl = vi.fn(async () => reply(404, { detail: 'Document not found.' }));
    await expect(new OcrClient(config, fetchImpl).delete(caller, remote.id)).resolves.toBeUndefined();
  });
});

describe('documents configuration', () => {
  const env = (values: Record<string, string>) => values as unknown as NodeJS.ProcessEnv;
  const STORAGE = { DOCUMENTS_BUCKET: 'redsky-documents', DOCUMENTS_S3_ENDPOINT: 'https://storage.example.com', DOCUMENTS_S3_ACCESS_KEY_ID: 'id', DOCUMENTS_S3_SECRET_ACCESS_KEY: 'secret' };
  const OCR = { OCR_URL: 'http://redsky-ocr.railway.internal:8080', OCR_SERVICE_TOKEN: 's'.repeat(40) };

  it('is available only with both the bucket and redsky-ocr', () => {
    expect(parseConfig(env({ NODE_ENV: 'production', ...STORAGE, ...OCR })).documents).toMatchObject({ available: true, tenantId: 'rsm', issues: [] });
    expect(parseConfig(env({ NODE_ENV: 'production', ...STORAGE })).documents.available).toBe(false);
    expect(parseConfig(env({ NODE_ENV: 'production', ...OCR })).documents.available).toBe(false);
  });

  it('refuses incomplete or unsafe settings', () => {
    const issuesFor = (values: Record<string, string>) => parseConfig(env({ NODE_ENV: 'production', ...STORAGE, ...OCR, ...values })).documents;
    expect(issuesFor({ OCR_SERVICE_TOKEN: 'short' })).toMatchObject({ available: false });
    expect(issuesFor({ DOCUMENTS_S3_SECRET_ACCESS_KEY: '' })).toMatchObject({ available: false });
    expect(issuesFor({ OCR_URL: 'http://ocr.example.com' })).toMatchObject({ available: false });
    expect(issuesFor({ OCR_EVENTS_SECRET: 'short' }).issues).toContain('OCR_EVENTS_SECRET must be at least 32 characters');
    expect(() => parseConfig(env({ NODE_ENV: 'production', REDSKY_TENANT_ID: 'has spaces' }))).toThrow();
  });
});
