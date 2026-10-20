import 'server-only';
import { eq } from 'drizzle-orm';
import { DEMO_WS_PROFILE } from '@/demo/sample-records';
import { WS_CONSENT_VERSION, WS_MAX_UPLOAD_BYTES, WS_RECOMMENDATION_IDS, type WsRecommendationId } from '@/features/workstyle/catalog';
import { acceptAllPending, wsApply, type WorkstyleBaseline, type WsRecommendationStates } from '@/features/workstyle/apply';
import { workstyleProfileDraftSchema, workstyleProfileSchema, type WorkstyleProfile, type WorkstyleProfileDraft } from '@/features/workstyle/profile';
import { suggestFromProfile } from '@/features/workstyle/rules';
import { parseTtiReportText, type ParseResult } from '@/features/workstyle/tti-parser';
import type { WorkstyleDetail, WorkstyleRecommendationChange } from '@/lib/api/contracts';
import { getConfig } from '@/server/config/env';
import { getDb } from '@/server/db/client';
import { workstyleAssessments, workstyleConsentLog, workstyleDocuments, type WorkstyleExtractionMeta } from '@/server/db/schema';
import { badRequest, notFound, unavailable } from '@/server/http/errors';
import { logger } from '@/server/logging/logger';
import { assertAuthorized, authorize, type Actor } from '@/server/security/access-policy';
import { recordAudit } from '@/server/security/audit';
import { decryptString, encryptBytes, encryptString } from '@/server/security/crypto';
import { extractPdfText, looksLikePdf } from '@/server/workstyle/pdf-text';
import { loadPreferencesState, savePreferencesState } from './preferences-service';

type Row = typeof workstyleAssessments.$inferSelect;
type StoredDraft = { draft: WorkstyleProfileDraft; found: ParseResult['found'] | null };

function key(): Buffer {
  const encryptionKey = getConfig().encryptionKey;
  if (!encryptionKey) throw unavailable('Workstyle storage is not configured by your administrator. You can still set your preferences manually in the next steps.');
  return encryptionKey;
}

const context = (userId: string, field: string) => `workstyle:${userId}:${field}`;

async function guard(actor: Actor, userId: string, action: 'read' | 'write' | 'delete' | 'share', requestId: string): Promise<void> {
  const decision = authorize(actor, action, { type: 'workstyle', ownerId: userId });
  if (!decision.allowed) {
    await recordAudit({ actorUserId: actor.userId, action: 'workstyle.read_denied', resourceType: 'workstyle', resourceId: userId, outcome: 'denied', requestId });
  }
  assertAuthorized(actor, action, { type: 'workstyle', ownerId: userId });
}

async function loadRow(userId: string): Promise<Row | null> {
  const [row] = await getDb().select().from(workstyleAssessments).where(eq(workstyleAssessments.userId, userId)).limit(1);
  return row ?? null;
}

function emptyDetail(): WorkstyleDetail {
  return {
    present: false,
    consentGiven: false,
    sourceKind: null,
    fileName: null,
    addedAt: null,
    extraction: { status: null, foundCount: 0, expectedCount: 14, parserVersion: null, pageCount: null },
    draft: null,
    found: null,
    profile: null,
    recommendations: [],
    recommendationStates: null,
    baseline: null,
    sharing: { manager: false, colleagues: false },
    retainOriginal: getConfig().workstyle.retainOriginal,
  };
}

function toDetail(userId: string, row: Row): WorkstyleDetail {
  const encryptionKey = key();
  const stored = row.draftCiphertext ? (JSON.parse(decryptString(row.draftCiphertext, encryptionKey, context(userId, 'draft'))) as StoredDraft) : null;
  const profile = row.profileCiphertext ? workstyleProfileSchema.parse(JSON.parse(decryptString(row.profileCiphertext, encryptionKey, context(userId, 'profile')))) : null;
  const suggestions = profile ? suggestFromProfile(profile) : null;
  return {
    present: true,
    consentGiven: true,
    sourceKind: row.sourceKind,
    fileName: row.sourceNameCiphertext ? decryptString(row.sourceNameCiphertext, encryptionKey, context(userId, 'name')) : null,
    addedAt: row.createdAt.toISOString(),
    extraction: {
      status: row.extraction.status,
      foundCount: row.extraction.foundCount ?? 0,
      expectedCount: row.extraction.expectedCount ?? 14,
      parserVersion: row.extraction.parserVersion ?? null,
      pageCount: row.extraction.pageCount ?? null,
    },
    draft: stored?.draft ?? null,
    found: stored?.found ?? null,
    profile,
    recommendations:
      suggestions && row.recommendations
        ? WS_RECOMMENDATION_IDS.map((id) => ({ id, choice: row.recommendations?.[id]?.choice ?? suggestions[id].choice, status: row.recommendations?.[id]?.status ?? 'pending', insight: suggestions[id].insight }))
        : [],
    recommendationStates: row.recommendations ?? null,
    baseline: row.baseline
      ? { density: row.baseline.density, aiStyle: row.baseline.aiStyle, prepFormat: row.baseline.prepFormat, taskGroup: row.baseline.taskGroup, notifMode: row.baseline.notifMode, draftTone: row.baseline.draftTone, layout: row.baseline.layout }
      : null,
    sharing: row.sharing,
    retainOriginal: getConfig().workstyle.retainOriginal,
  };
}

// Every read of assessment data is audited (SPEC §10.3), including the owner's own reads.
export async function getWorkstyleDetail(actor: Actor, userId: string, requestId: string): Promise<WorkstyleDetail> {
  await guard(actor, userId, 'read', requestId);
  const row = await loadRow(userId);
  if (!row) return emptyDetail();
  await recordAudit({ actorUserId: actor.userId, action: 'workstyle.read', resourceType: 'workstyle', resourceId: userId, requestId });
  return toDetail(userId, row);
}

async function storeSource(actor: Actor, userId: string, input: { sourceKind: Row['sourceKind']; fileName: string | null; extraction: WorkstyleExtractionMeta; stored: StoredDraft; profile: WorkstyleProfile | null }, requestId: string): Promise<void> {
  const encryptionKey = key();
  const existing = await loadRow(userId);
  const values = {
    consentAt: new Date(),
    consentVersion: WS_CONSENT_VERSION,
    sourceKind: input.sourceKind,
    sourceNameCiphertext: input.fileName ? encryptString(input.fileName, encryptionKey, context(userId, 'name')) : null,
    extraction: input.extraction,
    draftCiphertext: encryptString(JSON.stringify(input.stored), encryptionKey, context(userId, 'draft')),
    profileCiphertext: input.profile ? encryptString(JSON.stringify(input.profile), encryptionKey, context(userId, 'profile')) : null,
    reviewedAt: input.profile ? new Date() : null,
    updatedAt: new Date(),
  };
  await getDb()
    .insert(workstyleAssessments)
    .values({ userId, ...values })
    // Replacing the report keeps the employee's decisions, baseline and sharing choices (SPEC §7.5).
    .onConflictDoUpdate({ target: workstyleAssessments.userId, set: values });
  if (!existing) {
    await getDb().insert(workstyleConsentLog).values({ userId, scope: 'processing', action: 'granted', consentVersion: WS_CONSENT_VERSION });
    await recordAudit({ actorUserId: actor.userId, action: 'workstyle.consent_granted', resourceType: 'workstyle', resourceId: userId, requestId, metadata: { version: WS_CONSENT_VERSION } });
  }
}

export async function uploadAssessment(actor: Actor, userId: string, file: { name: string; bytes: Buffer }, consent: boolean, requestId: string): Promise<WorkstyleDetail> {
  await guard(actor, userId, 'write', requestId);
  if (!consent) throw badRequest('Please confirm consent before uploading');
  key();
  if (file.bytes.length === 0) throw badRequest('The file is empty');
  if (file.bytes.length > WS_MAX_UPLOAD_BYTES) throw badRequest('Reports can be up to 10 MB');
  if (!looksLikePdf(file.bytes)) throw badRequest('Please upload your report as a PDF');

  let parse: ParseResult;
  let pageCount = 0;
  try {
    const extracted = await extractPdfText(file.bytes);
    pageCount = extracted.pageCount;
    parse = parseTtiReportText(extracted.text, extracted.pageCount);
  } catch (error) {
    logger.warn('Workstyle PDF could not be read', { error });
    parse = parseTtiReportText('', 1);
  }
  const safeName = file.name.replace(/[\\/\u0000-\u001f]/g, '').slice(0, 160) || 'Assessment.pdf';
  await storeSource(
    actor,
    userId,
    {
      sourceKind: 'upload',
      fileName: safeName,
      extraction: { status: parse.status, parserVersion: parse.parserVersion, pageCount, foundCount: parse.foundCount, expectedCount: parse.expectedCount },
      stored: { draft: parse.draft, found: parse.found },
      profile: null,
    },
    requestId,
  );
  if (getConfig().workstyle.retainOriginal) {
    const ciphertext = encryptBytes(file.bytes, key(), context(userId, 'document'));
    await getDb()
      .insert(workstyleDocuments)
      .values({ userId, ciphertext, mime: 'application/pdf', sizeBytes: file.bytes.length })
      .onConflictDoUpdate({ target: workstyleDocuments.userId, set: { ciphertext, sizeBytes: file.bytes.length, createdAt: new Date() } });
  }
  await recordAudit({ actorUserId: actor.userId, action: 'workstyle.uploaded', resourceType: 'workstyle', resourceId: userId, requestId, metadata: { status: parse.status, pages: pageCount, found: parse.foundCount, retained: getConfig().workstyle.retainOriginal } });
  return toDetail(userId, (await loadRow(userId)) as Row);
}

export async function startManualAssessment(actor: Actor, userId: string, consent: boolean, requestId: string): Promise<WorkstyleDetail> {
  await guard(actor, userId, 'write', requestId);
  if (!consent) throw badRequest('Please confirm consent first');
  const existing = await loadRow(userId);
  const draft = existing ? toDetail(userId, existing).draft : null;
  await storeSource(actor, userId, { sourceKind: 'manual', fileName: null, extraction: { status: 'manual' }, stored: { draft: draft ?? workstyleProfileDraftSchema.parse(emptyDraft()), found: null }, profile: null }, requestId);
  return toDetail(userId, (await loadRow(userId)) as Row);
}

function emptyDraft(): WorkstyleProfileDraft {
  return {
    disc: { D: { natural: null, adapted: null }, I: { natural: null, adapted: null }, S: { natural: null, adapted: null }, C: { natural: null, adapted: null } },
    drivingForces: { knowledge: null, utility: null, surroundings: null, others: null, power: null, methodologies: null },
    preferences: { communication: '', decisionMaking: '', motivation: '', environment: '' },
  };
}

// The prototype's illustrative assessment, for demos only. It is stored as a sample, labelled as such
// everywhere, and never offered in production mode.
export function sampleProfile(): WorkstyleProfile {
  const disc = Object.fromEntries(DEMO_WS_PROFILE.disc.map((entry) => [entry.k, { natural: entry.nat, adapted: entry.adp }])) as WorkstyleProfile['disc'];
  const force = (motivator: string) => DEMO_WS_PROFILE.forces.find((entry) => entry.m === motivator)?.pos ?? 50;
  const pref = (name: string) => DEMO_WS_PROFILE.prefs.find((entry) => entry.k === name)?.v ?? '';
  return {
    disc,
    drivingForces: { knowledge: force('Knowledge'), utility: force('Utility'), surroundings: force('Surroundings'), others: force('Others'), power: force('Power'), methodologies: force('Methodologies') },
    preferences: { communication: pref('Communication'), decisionMaking: pref('Decision-making'), motivation: pref('Motivation'), environment: pref('Environment') },
  };
}

export async function startSampleAssessment(actor: Actor, userId: string, consent: boolean, requestId: string): Promise<WorkstyleDetail> {
  await guard(actor, userId, 'write', requestId);
  if (getConfig().dataMode !== 'demo') throw notFound('Not found');
  if (!consent) throw badRequest('Please confirm consent first');
  const profile = sampleProfile();
  await storeSource(actor, userId, { sourceKind: 'sample', fileName: 'TTI Talent Insights — sample report.pdf', extraction: { status: 'sample', foundCount: 14, expectedCount: 14 }, stored: { draft: profile, found: null }, profile }, requestId);
  await initializeRecommendations(userId, profile);
  return toDetail(userId, (await loadRow(userId)) as Row);
}

export async function saveDraft(actor: Actor, userId: string, draft: WorkstyleProfileDraft, requestId: string): Promise<void> {
  await guard(actor, userId, 'write', requestId);
  const row = await loadRow(userId);
  if (!row) throw notFound('Upload a report or choose manual entry first');
  const current = toDetail(userId, row);
  await getDb()
    .update(workstyleAssessments)
    .set({ draftCiphertext: encryptString(JSON.stringify({ draft, found: current.found } satisfies StoredDraft), key(), context(userId, 'draft')), updatedAt: new Date() })
    .where(eq(workstyleAssessments.userId, userId));
}

// The employee confirms the values (extracted or typed). Only then are recommendations generated.
export async function submitReview(actor: Actor, userId: string, profile: WorkstyleProfile, requestId: string): Promise<WorkstyleDetail> {
  await guard(actor, userId, 'write', requestId);
  const row = await loadRow(userId);
  if (!row) throw notFound('Upload a report or choose manual entry first');
  const encryptionKey = key();
  await getDb()
    .update(workstyleAssessments)
    .set({
      profileCiphertext: encryptString(JSON.stringify(profile), encryptionKey, context(userId, 'profile')),
      draftCiphertext: encryptString(JSON.stringify({ draft: profile, found: toDetail(userId, row).found } satisfies StoredDraft), encryptionKey, context(userId, 'draft')),
      reviewedAt: new Date(),
      updatedAt: new Date(),
    })
    .where(eq(workstyleAssessments.userId, userId));
  await initializeRecommendations(userId, profile);
  await recordAudit({ actorUserId: actor.userId, action: 'workstyle.reviewed', resourceType: 'workstyle', resourceId: userId, requestId });
  return toDetail(userId, (await loadRow(userId)) as Row);
}

// Takes the baseline snapshot the first time and keeps earlier decisions when a report is replaced.
async function initializeRecommendations(userId: string, profile: WorkstyleProfile): Promise<void> {
  const row = await loadRow(userId);
  if (!row) return;
  const suggestions = suggestFromProfile(profile);
  const state = await loadPreferencesState(userId);
  const baseline: WorkstyleBaseline = row.baseline ?? {
    density: state.preferences.density,
    layout: state.layout.layout,
    layoutTouched: state.layout.layoutTouched,
    aiStyle: state.preferences.aiStyle,
    prepFormat: state.preferences.prepFormat,
    taskGroup: state.preferences.taskGroup,
    notifMode: state.preferences.notifMode,
    draftTone: state.preferences.draftTone,
  };
  const recommendations = Object.fromEntries(
    WS_RECOMMENDATION_IDS.map((id) => [id, row.recommendations?.[id] ?? { status: 'pending', choice: suggestions[id].choice }]),
  ) as WsRecommendationStates;
  await getDb().update(workstyleAssessments).set({ baseline, recommendations, updatedAt: new Date() }).where(eq(workstyleAssessments.userId, userId));
}

export async function changeRecommendations(actor: Actor, userId: string, change: WorkstyleRecommendationChange, requestId: string): Promise<WorkstyleDetail> {
  await guard(actor, userId, 'write', requestId);
  const row = await loadRow(userId);
  if (!row?.recommendations || !row.baseline) throw notFound('Review your assessment first');
  let recommendations: WsRecommendationStates = { ...row.recommendations };
  if ('acceptAll' in change) {
    recommendations = acceptAllPending(recommendations);
  } else {
    const current = recommendations[change.id];
    recommendations[change.id] = { status: change.status ?? current.status, choice: change.choice ?? current.choice };
  }
  const state = await loadPreferencesState(userId);
  const effect = wsApply({ baseline: row.baseline, recommendations, focusAreas: state.focusAreas, goals: state.preferences.goals });
  await savePreferencesState(userId, {
    focusAreas: state.focusAreas,
    preferences: { ...state.preferences, density: effect.density, aiStyle: effect.aiStyle, prepFormat: effect.prepFormat, taskGroup: effect.taskGroup, notifMode: effect.notifMode, draftTone: effect.draftTone },
    layout: { layout: effect.layout, layoutTouched: effect.layoutTouched },
  });
  await getDb().update(workstyleAssessments).set({ recommendations, updatedAt: new Date() }).where(eq(workstyleAssessments.userId, userId));
  await recordAudit({ actorUserId: actor.userId, action: 'workstyle.recommendations_changed', resourceType: 'workstyle', resourceId: userId, requestId, metadata: { change: 'acceptAll' in change ? 'accept_all' : change.id } });
  return toDetail(userId, (await loadRow(userId)) as Row);
}

// Sharing exposes only a short preference summary — never scores, Driving Forces or the report — and each
// grant needs its own consent (the client shows the consent dialog before calling this).
export async function setSharing(actor: Actor, userId: string, scope: 'manager' | 'colleagues', enabled: boolean, requestId: string): Promise<WorkstyleDetail> {
  await guard(actor, userId, 'share', requestId);
  const row = await loadRow(userId);
  if (!row) throw notFound('No assessment to share');
  const sharing = { ...row.sharing, [scope]: enabled };
  await getDb().update(workstyleAssessments).set({ sharing, updatedAt: new Date() }).where(eq(workstyleAssessments.userId, userId));
  await getDb().insert(workstyleConsentLog).values({ userId, scope: scope === 'manager' ? 'share_manager' : 'share_colleagues', action: enabled ? 'granted' : 'revoked', consentVersion: WS_CONSENT_VERSION });
  await recordAudit({ actorUserId: actor.userId, action: 'workstyle.sharing_changed', resourceType: 'workstyle', resourceId: userId, requestId, metadata: { scope, enabled } });
  return toDetail(userId, (await loadRow(userId)) as Row);
}

// Hard delete of the report, extracted insights and decisions. Current RedSky settings stay as they are.
export async function deleteAssessment(actor: Actor, userId: string, requestId: string): Promise<void> {
  await guard(actor, userId, 'delete', requestId);
  await getDb().transaction(async (tx) => {
    await tx.delete(workstyleDocuments).where(eq(workstyleDocuments.userId, userId));
    await tx.delete(workstyleAssessments).where(eq(workstyleAssessments.userId, userId));
    await tx.insert(workstyleConsentLog).values({ userId, scope: 'processing', action: 'revoked', consentVersion: WS_CONSENT_VERSION });
  });
  await recordAudit({ actorUserId: actor.userId, action: 'workstyle.deleted', resourceType: 'workstyle', resourceId: userId, requestId });
}
