import 'server-only';
import { and, desc, eq, inArray, lte, or, sql } from 'drizzle-orm';
import {
  DOCUMENT_MAX_BYTES,
  DOCUMENT_STATUS_IN_PROGRESS,
  documentStatusMessage,
  type DocumentStatus,
  type DocumentVisibility,
} from '@/features/documents/catalog';
import type { DocumentContentView, DocumentListResponse, DocumentRow, DocumentSearchResponse, DocumentView } from '@/lib/api/contracts';
import { getConfig } from '@/server/config/env';
import { getDb } from '@/server/db/client';
import { documents, ocrEventReceipts, users } from '@/server/db/schema';
import { detectDocumentType, displayFileName, sha256Hex, storageKeyFor } from '@/server/documents/files';
import { OcrClient, OcrError, type OcrCaller, type OcrDocument } from '@/server/documents/ocr-client';
import type { OcrEvent } from '@/server/documents/ocr-events';
import { S3DocumentStorage, StorageError, type DocumentStorage, type StoredObject } from '@/server/documents/storage';
import { badRequest, HttpError, notFound, unavailable } from '@/server/http/errors';
import { logger } from '@/server/logging/logger';
import { assertAuthorized, authorize, type Actor } from '@/server/security/access-policy';
import { recordAudit } from '@/server/security/audit';

type Row = typeof documents.$inferSelect;
type RowWithOwner = { document: Row; ownerName: string | null };

type Backends = { storage: DocumentStorage; ocr: OcrClient; tenantId: string };

const LIST_LIMIT = 50;
// Fallback for missed events: rows still in progress are re-read from redsky-ocr when the list is shown,
// a few at a time and with a short timeout, so a slow reader never slows the page down much.
const REFRESH_AFTER_MS = 20_000;
const REFRESH_BATCH = 5;
const REFRESH_TIMEOUT_MS = 3_000;
const MAX_TABLE_ROWS = 200;
const MAX_TABLE_COLUMNS = 30;

let cachedBackends: Backends | null = null;
let reportedIssues = false;

export function documentsConfigured(): boolean {
  return getConfig().documents.available;
}

function backends(): Backends {
  const config = getConfig().documents;
  if (!config.storage || !config.ocr) {
    if (!reportedIssues) {
      reportedIssues = true;
      logger.warn('Documents are not configured', { issues: config.issues });
    }
    throw unavailable('Document storage isn’t set up yet. Your administrator connects it.');
  }
  cachedBackends ??= { storage: new S3DocumentStorage(config.storage), ocr: new OcrClient(config.ocr), tenantId: config.tenantId };
  return cachedBackends;
}

function callerFor(userId: string): OcrCaller {
  return { tenantId: backends().tenantId, userId };
}

function resourceFor(row: Row) {
  return { type: 'document' as const, ownerId: row.ownerId, visibility: row.visibility };
}

function toView(actor: Actor, { document, ownerName }: RowWithOwner): DocumentRow {
  const isYou = document.ownerId === actor.userId;
  return {
    id: document.id,
    fileName: document.fileName,
    mimeType: document.mimeType,
    sizeBytes: document.sizeBytes,
    visibility: document.visibility,
    relatedLabel: document.relatedLabel,
    status: document.status,
    statusMessage: documentStatusMessage(document.status, document.statusReason),
    noAi: document.noAi,
    pageCount: document.pageCount,
    owner: { name: isYou ? 'You' : (ownerName ?? 'Former colleague'), isYou },
    createdAt: document.createdAt.toISOString(),
    canChange: authorize(actor, 'delete', resourceFor(document)).allowed,
  };
}

async function loadVisible(actor: Actor, id: string, action: 'read' | 'write' | 'delete'): Promise<RowWithOwner> {
  if (!/^[0-9a-f-]{36}$/i.test(id)) throw notFound('Document not found');
  const [found] = await getDb()
    .select({ document: documents, ownerName: users.displayName })
    .from(documents)
    .leftJoin(users, eq(users.id, documents.ownerId))
    .where(eq(documents.id, id))
    .limit(1);
  // A private document of someone else looks exactly like a missing one.
  if (!found || !authorize(actor, 'read', resourceFor(found.document)).allowed) throw notFound('Document not found');
  assertAuthorized(actor, action, resourceFor(found.document));
  return found;
}

type StatusReport = { status: DocumentStatus; statusReason: string | null; noAi?: boolean; pageCount?: number | null; reportedAt: Date };

// Applies a status redsky-ocr reported, unless RedSky already holds a newer one. `reportedAt` always comes from
// redsky-ocr's clock (an event's occurredAt or the document's updatedAt), so the comparison survives clock skew
// between services.
async function applyStatus(row: Row, report: StatusReport): Promise<Row> {
  const [updated] = await getDb()
    .update(documents)
    .set({
      status: report.status,
      statusReason: report.statusReason,
      statusAt: report.reportedAt,
      ...(report.noAi !== undefined ? { noAi: report.noAi } : {}),
      ...(report.pageCount ? { pageCount: report.pageCount } : {}),
      updatedAt: new Date(),
    })
    .where(and(eq(documents.id, row.id), lte(documents.statusAt, report.reportedAt)))
    .returning();
  return updated ?? row;
}

async function applyRemote(row: Row, remote: OcrDocument): Promise<Row> {
  let current = row;
  if (!row.ocrDocumentId) {
    // Outside the ordering check: losing the link to redsky-ocr would strand the document.
    const [linked] = await getDb().update(documents).set({ ocrDocumentId: remote.id, updatedAt: new Date() }).where(eq(documents.id, row.id)).returning();
    current = linked ?? row;
  }
  return applyStatus(current, { status: remote.status, statusReason: remote.statusReason, noAi: remote.noAi, pageCount: remote.currentExtraction?.pageCount ?? null, reportedAt: new Date(remote.updatedAt) });
}

// Hands a stored document to redsky-ocr on behalf of its uploader. A failure leaves it `registering`; the next
// refresh or a retry tries again.
async function register(row: Row): Promise<Row> {
  try {
    const remote = await backends().ocr.register(callerFor(row.ownerId), { key: row.storageKey, filename: row.fileName });
    return await applyRemote(row, remote);
  } catch (error) {
    logger.warn('Registering a document with text extraction failed', { documentId: row.id, reason: error instanceof OcrError ? error.kind : 'unknown' });
    return row;
  }
}

async function refresh(row: Row, timeoutMs?: number): Promise<Row> {
  if (!row.ocrDocumentId) return register(row);
  try {
    const remote = await backends().ocr.get(callerFor(row.ownerId), row.ocrDocumentId, timeoutMs);
    return await applyRemote(row, remote);
  } catch (error) {
    logger.warn('Refreshing a document status failed', { documentId: row.id, reason: error instanceof OcrError ? error.kind : 'unknown' });
    return row;
  }
}

const inProgress = (row: Row) => DOCUMENT_STATUS_IN_PROGRESS.includes(row.status);
const isStale = (row: Row, now: number) => now - row.statusAt.getTime() > REFRESH_AFTER_MS;

export type DocumentUpload = { name: string; bytes: Buffer };
export type DocumentUploadOptions = { visibility: DocumentVisibility; relatedLabel: string };

export async function uploadDocument(actor: Actor, upload: DocumentUpload, options: DocumentUploadOptions, requestId: string): Promise<DocumentRow> {
  const { storage } = backends();
  if (upload.bytes.length === 0) throw badRequest('That file is empty.');
  if (upload.bytes.length > DOCUMENT_MAX_BYTES) throw new HttpError(413, 'too_large', 'Files can be up to 50 MB.');
  const fileName = displayFileName(upload.name);
  const detected = detectDocumentType(upload.bytes, fileName);
  if (!detected) throw badRequest('RedSky reads PDF, Word, PowerPoint, Excel and image files (PNG, JPEG, TIFF).');

  const storageKey = storageKeyFor(fileName, detected);
  try {
    await storage.put(storageKey, upload.bytes, detected.mime);
  } catch (error) {
    logger.error('Storing an uploaded document failed', { requestId, error });
    throw new HttpError(503, 'storage_unavailable', 'RedSky couldn’t store the file. Please try again.');
  }

  let row: Row | undefined;
  try {
    [row] = await getDb()
      .insert(documents)
      .values({
        ownerId: actor.userId,
        storageKey,
        fileName,
        mimeType: detected.mime,
        sizeBytes: upload.bytes.length,
        sha256: sha256Hex(upload.bytes),
        visibility: options.visibility,
        relatedLabel: options.relatedLabel,
        status: 'registering',
        // No report from redsky-ocr yet: any report it sends is newer than this.
        statusAt: new Date(0),
      })
      .returning();
  } catch (error) {
    await storage.delete(storageKey).catch(() => undefined);
    throw error;
  }
  if (!row) throw new Error('Inserting the document returned no row');
  await recordAudit({ actorUserId: actor.userId, action: 'document.uploaded', resourceType: 'document', resourceId: row.id, requestId, metadata: { sizeBytes: row.sizeBytes, mimeType: row.mimeType, visibility: row.visibility } });
  row = await register(row);
  return toView(actor, { document: row, ownerName: null });
}

export async function listDocuments(actor: Actor, cursor: string | null): Promise<DocumentListResponse> {
  if (!documentsConfigured()) return { status: 'not_configured' };
  const position = parseCursor(cursor);
  const visible = or(eq(documents.ownerId, actor.userId), eq(documents.visibility, 'firm'));
  const rows = await getDb()
    .select({ document: documents, ownerName: users.displayName })
    .from(documents)
    .leftJoin(users, eq(users.id, documents.ownerId))
    .where(position ? and(visible, sql`(${documents.createdAt}, ${documents.id}) < (${position.createdAt}, ${position.id})`) : visible)
    .orderBy(desc(documents.createdAt), desc(documents.id))
    .limit(LIST_LIMIT + 1);
  const page = rows.slice(0, LIST_LIMIT).filter((row) => authorize(actor, 'read', resourceFor(row.document)).allowed);

  const now = Date.now();
  const stale = page.filter((row) => inProgress(row.document) && isStale(row.document, now)).slice(0, REFRESH_BATCH);
  const refreshed = new Map((await Promise.all(stale.map((row) => refresh(row.document, REFRESH_TIMEOUT_MS)))).map((row) => [row.id, row]));
  const last = rows.length > LIST_LIMIT ? rows[LIST_LIMIT - 1]?.document : undefined;
  return {
    status: 'ok',
    documents: page.map((row) => toView(actor, { document: refreshed.get(row.document.id) ?? row.document, ownerName: row.ownerName })),
    nextCursor: last ? `${last.createdAt.toISOString()}|${last.id}` : null,
  };
}

function parseCursor(cursor: string | null): { createdAt: string; id: string } | null {
  if (!cursor) return null;
  const [createdAt, id] = cursor.split('|');
  if (!createdAt || !id || Number.isNaN(Date.parse(createdAt)) || !/^[0-9a-f-]{36}$/i.test(id)) throw badRequest('Invalid cursor');
  return { createdAt, id };
}

export async function getDocument(actor: Actor, id: string): Promise<DocumentRow> {
  backends();
  const found = await loadVisible(actor, id, 'read');
  const document = inProgress(found.document) ? await refresh(found.document, REFRESH_TIMEOUT_MS) : found.document;
  return toView(actor, { ...found, document });
}

export async function getDocumentContent(actor: Actor, id: string, requestId: string): Promise<DocumentContentView> {
  backends();
  const { document } = await loadVisible(actor, id, 'read');
  if (document.noAi) return { status: 'no_ai' };
  if (!document.ocrDocumentId || (document.status !== 'completed' && document.status !== 'needs_review')) return { status: 'not_ready' };
  const caller = callerFor(document.ownerId);
  const { ocr } = backends();
  let content;
  let tables;
  try {
    [content, tables] = await Promise.all([ocr.content(caller, document.ocrDocumentId), ocr.tables(caller, document.ocrDocumentId)]);
  } catch (error) {
    if (error instanceof OcrError && (error.kind === 'not_ready' || error.kind === 'not_found')) return { status: 'not_ready' };
    throw ocrUnavailable(error);
  }
  await recordAudit({ actorUserId: actor.userId, action: 'document.read', resourceType: 'document', resourceId: document.id, requestId });
  return {
    status: 'ready',
    engine: content.engine,
    pageCount: content.pageCount,
    pages: content.pages.map((page) => ({ pageNumber: page.pageNumber, text: page.text ?? '', method: page.method })),
    tables: tables.tables.map((table) => ({
      index: table.index,
      pageNumber: table.pageNumber,
      caption: table.caption,
      cells: table.cells.slice(0, MAX_TABLE_ROWS).map((cells) => cells.slice(0, MAX_TABLE_COLUMNS)),
    })),
  };
}

export async function openOriginal(actor: Actor, id: string, requestId: string): Promise<{ object: StoredObject; fileName: string; mimeType: string }> {
  const { storage } = backends();
  const { document } = await loadVisible(actor, id, 'read');
  let object: StoredObject | null;
  try {
    object = await storage.get(document.storageKey);
  } catch (error) {
    logger.error('Reading a stored document failed', { requestId, documentId: document.id, error });
    throw new HttpError(503, 'storage_unavailable', 'RedSky couldn’t fetch the file. Please try again.');
  }
  if (!object) throw notFound('The original file is missing from storage');
  await recordAudit({ actorUserId: actor.userId, action: 'document.downloaded', resourceType: 'document', resourceId: document.id, requestId });
  return { object, fileName: document.fileName, mimeType: document.mimeType };
}

export async function retryDocument(actor: Actor, id: string, requestId: string): Promise<DocumentRow> {
  const { ocr } = backends();
  const found = await loadVisible(actor, id, 'write');
  let document = found.document;
  if (document.status === 'registering') {
    document = await register(document);
    if (document.status === 'registering') throw new HttpError(503, 'ocr_unavailable', 'Text extraction isn’t reachable right now. Please try again later.');
  } else if (document.status === 'failed' && document.ocrDocumentId) {
    try {
      document = await applyRemote(document, await ocr.reprocess(callerFor(document.ownerId), document.ocrDocumentId));
    } catch (error) {
      if (error instanceof OcrError && error.kind === 'conflict') throw new HttpError(409, 'in_progress', 'RedSky is already reading this file.');
      throw ocrUnavailable(error);
    }
  } else {
    throw new HttpError(409, 'nothing_to_retry', 'Only files RedSky couldn’t read can be retried.');
  }
  await recordAudit({ actorUserId: actor.userId, action: 'document.reprocessed', resourceType: 'document', resourceId: document.id, requestId });
  return toView(actor, { ...found, document });
}

// Removes what redsky-ocr derived, then the original, then RedSky's record. A failure stops before anything
// visible disappears, so the delete can simply be repeated.
export async function deleteDocument(actor: Actor, id: string, requestId: string): Promise<void> {
  const { storage, ocr } = backends();
  const { document } = await loadVisible(actor, id, 'delete');
  if (document.ocrDocumentId) {
    try {
      await ocr.delete(callerFor(document.ownerId), document.ocrDocumentId);
    } catch (error) {
      throw ocrUnavailable(error);
    }
  }
  try {
    await storage.delete(document.storageKey);
  } catch (error) {
    logger.error('Deleting a stored document failed', { requestId, documentId: document.id, error });
    throw new HttpError(503, 'storage_unavailable', 'RedSky couldn’t delete the file. Please try again.');
  }
  await getDb().delete(documents).where(eq(documents.id, document.id));
  await recordAudit({ actorUserId: actor.userId, action: 'document.deleted', resourceType: 'document', resourceId: document.id, requestId, metadata: { visibility: document.visibility } });
}

export async function searchDocuments(actor: Actor, query: string): Promise<DocumentSearchResponse> {
  const { ocr } = backends();
  const term = query.trim();
  if (term.length < 2) return { results: [] };
  let hits;
  try {
    // Over-fetch: hits on documents this person can't see (and on Twenty attachments) are dropped below.
    hits = await ocr.search(callerFor(actor.userId), term.slice(0, 200), 50);
  } catch (error) {
    throw ocrUnavailable(error);
  }
  const ids = [...new Set(hits.filter((hit) => hit.source.system === 'storage').map((hit) => hit.documentId))];
  if (ids.length === 0) return { results: [] };
  const rows = await getDb()
    .select()
    .from(documents)
    .where(and(inArray(documents.ocrDocumentId, ids), or(eq(documents.ownerId, actor.userId), eq(documents.visibility, 'firm'))));
  const byOcrId = new Map(rows.filter((row) => authorize(actor, 'read', resourceFor(row)).allowed && !row.noAi).map((row) => [row.ocrDocumentId, row]));
  const results: DocumentSearchResponse['results'] = [];
  for (const hit of hits) {
    const row = byOcrId.get(hit.documentId);
    if (row) results.push({ documentId: row.id, fileName: row.fileName, pageNumber: hit.pageNumber, snippet: hit.snippet });
    if (results.length >= 20) break;
  }
  return { results };
}

export async function recentDocumentViews(actor: Actor, limit: number): Promise<DocumentView[]> {
  const rows = await getDb()
    .select({ document: documents, ownerName: users.displayName })
    .from(documents)
    .leftJoin(users, eq(users.id, documents.ownerId))
    .where(or(eq(documents.ownerId, actor.userId), eq(documents.visibility, 'firm')))
    .orderBy(desc(documents.createdAt))
    .limit(limit);
  return rows
    .filter((row) => authorize(actor, 'read', resourceFor(row.document)).allowed)
    .map((row) => {
      const view = toView(actor, row);
      const day = row.document.createdAt.toLocaleDateString('en-US', { month: 'short', day: 'numeric', timeZone: getConfig().timeZone });
      return { id: view.id, name: view.fileName, meta: `${view.owner.name} · ${day}`, kind: view.fileName.split('.').pop()?.toUpperCase() ?? 'File', href: `/documents?open=${view.id}` };
    });
}

export type OcrEventOutcome = 'applied' | 'duplicate' | 'ignored';

// Events come from redsky-ocr, signed (src/server/documents/ocr-events.ts). They are hints about state redsky-ocr
// owns, so applying one twice or late is harmless; the receipt table only saves repeated work.
export async function applyOcrEvent(event: OcrEvent): Promise<OcrEventOutcome> {
  const config = getConfig().documents;
  if (event.tenantId !== config.tenantId || event.document.source.system !== 'storage' || event.type === 'document.deleted') return 'ignored';
  const [receipt] = await getDb().insert(ocrEventReceipts).values({ eventId: event.id }).onConflictDoNothing().returning();
  if (!receipt) return 'duplicate';
  const [row] = await getDb().select().from(documents).where(eq(documents.ocrDocumentId, event.document.id)).limit(1);
  if (!row) return 'ignored';
  const updated = await applyStatus(row, { status: event.document.status, statusReason: event.document.statusReason, reportedAt: new Date(event.occurredAt) });
  // The event carries no page count; one read fills it in for the list.
  if (updated.pageCount === null && (updated.status === 'completed' || updated.status === 'needs_review')) await refresh(updated, REFRESH_TIMEOUT_MS);
  return 'applied';
}

function ocrUnavailable(error: unknown): HttpError {
  if (error instanceof HttpError) return error;
  logger.warn('Text extraction call failed', { reason: error instanceof OcrError ? error.kind : error instanceof StorageError ? 'storage' : 'unknown' });
  return new HttpError(503, 'ocr_unavailable', 'Text extraction isn’t reachable right now. Please try again later.');
}
