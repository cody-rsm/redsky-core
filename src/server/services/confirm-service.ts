import 'server-only';
import { and, eq } from 'drizzle-orm';
import { DEMO_ATT, DEMO_APPROVALS, DEMO_MEET, DEMO_RECS } from '@/demo/sample-records';
import { aiAnswerSchema, actionRequiresConfirmation } from '@/features/ai/types';
import type { ConfirmOrigin, ConfirmResult } from '@/lib/api/contracts';
import { getConfig } from '@/server/config/env';
import { demoPrepSource } from '@/server/data/demo/demo-prep';
import type { ProviderContext } from '@/server/data/types';
import { getDb } from '@/server/db/client';
import { aiActionExecutions, aiConversations, aiMessages } from '@/server/db/schema';
import { badRequest, notFound, unavailable } from '@/server/http/errors';
import { recordAudit } from '@/server/security/audit';
import { patchItemState } from './item-state-service';
import { createTasks, type TaskInput } from './task-service';

// Runs an action a person confirmed in a confirmation dialog. The server re-derives the action from its own
// records (the AI message it stored, the recommendation or meeting it owns) — the client only names which one —
// so a tampered request cannot widen what gets created. Each confirmation runs at most once.
export async function confirmAction(context: ProviderContext, origin: ConfirmOrigin, requestId: string): Promise<ConfirmResult> {
  const actionKey = keyFor(origin);
  const [claimed] = await getDb().insert(aiActionExecutions).values({ userId: context.userId, actionKey, kind: origin.type }).onConflictDoNothing().returning({ id: aiActionExecutions.id });
  if (!claimed) return { ok: true, message: 'Already done', simulated: false };
  try {
    const result = await execute(context, origin, requestId);
    await recordAudit({
      actorUserId: context.userId,
      action: origin.type === 'approval' ? 'approval.approved' : 'ai.action_confirmed',
      resourceType: origin.type,
      resourceId: originId(origin),
      requestId,
      metadata: { simulated: result.simulated },
    });
    return result;
  } catch (error) {
    await getDb().delete(aiActionExecutions).where(and(eq(aiActionExecutions.userId, context.userId), eq(aiActionExecutions.actionKey, actionKey)));
    throw error;
  }
}

function keyFor(origin: ConfirmOrigin): string {
  switch (origin.type) {
    case 'ai_message':
      return `ai:${origin.messageId}:${origin.actionIndex}`;
    case 'recommendation':
      return `rec:${origin.id}`;
    case 'meeting_followups':
      return `prep:${origin.meetingId}`;
    case 'approval':
      return `approval:${origin.id}`;
  }
}

function originId(origin: ConfirmOrigin): string {
  return origin.type === 'ai_message' ? origin.messageId : origin.type === 'meeting_followups' ? origin.meetingId : origin.id;
}

function requireDemo(): void {
  if (getConfig().dataMode !== 'demo') throw notFound('Not found');
}

async function execute(context: ProviderContext, origin: ConfirmOrigin, requestId: string): Promise<ConfirmResult> {
  const demo = getConfig().dataMode === 'demo';
  if (origin.type === 'ai_message') {
    const [row] = await getDb()
      .select({ content: aiMessages.content, role: aiMessages.role })
      .from(aiMessages)
      .innerJoin(aiConversations, eq(aiConversations.id, aiMessages.conversationId))
      .where(and(eq(aiMessages.id, origin.messageId), eq(aiConversations.userId, context.userId)))
      .limit(1);
    if (!row || row.role !== 'assistant') throw notFound('That answer was not found');
    const action = aiAnswerSchema.parse(row.content).actions[origin.actionIndex];
    if (!action || !actionRequiresConfirmation(action)) throw badRequest('That action does not need confirmation');
    if (action.kind === 'tasks') return createConfirmedTasks(context, action.tasks, 'ai_confirmed', 'Created with RedSky AI', requestId);
    if (!demo) throw unavailable(action.kind === 'draft' ? 'Saving drafts needs Outlook, which is not connected yet.' : 'Creating documents needs OneDrive / SharePoint, which is not connected yet.');
    return { ok: true, simulated: true, message: action.kind === 'draft' ? 'Draft saved to Outlook (simulated)' : 'Draft brief created in Documents (simulated)' };
  }

  if (origin.type === 'recommendation') {
    requireDemo();
    const recommendation = (DEMO_RECS[context.persona] ?? []).find((entry) => entry.id === origin.id);
    if (!recommendation) throw notFound('Recommendation not found');
    await patchItemState(context.actor, context.userId, 'demo', `rec:${recommendation.id}`, { done: true });
    if (recommendation.kind === 'tasks' && recommendation.tasks) return createConfirmedTasks(context, recommendation.tasks, 'ai_confirmed', 'Created with RedSky AI', requestId);
    if (recommendation.kind === 'propose') return { ok: true, simulated: true, message: 'Proposal sent to Aisha Patel (simulated)' };
    throw badRequest('This recommendation opens RedSky AI instead');
  }

  if (origin.type === 'meeting_followups') {
    requireDemo();
    const prep = demoPrepSource(origin.meetingId);
    if (!prep || prep.followups.length === 0) throw notFound('No follow-ups for this meeting');
    const related = DEMO_MEET[origin.meetingId]?.org ?? '';
    const inputs: TaskInput[] = prep.followups.map((followup) => ({ title: followup.t, related, due: /overdue/.test(followup.due) ? 'Today' : followup.due }));
    return createConfirmedTasks(context, inputs, 'meeting_prep', 'From meeting preparation', requestId);
  }

  requireDemo();
  const approval = DEMO_APPROVALS.find((entry) => entry.id === origin.id);
  if (!approval) throw notFound('Approval not found');
  await patchItemState(context.actor, context.userId, 'demo', `approval:${approval.id}`, { approved: true });
  for (const item of DEMO_ATT.filter((entry) => entry.apId === approval.id)) {
    await patchItemState(context.actor, context.userId, 'demo', `att:${item.id}`, { done: true });
  }
  return { ok: true, simulated: true, message: `Approved — ${approval.by} has been notified` };
}

async function createConfirmedTasks(context: ProviderContext, inputs: TaskInput[], source: 'ai_confirmed' | 'meeting_prep', note: string, requestId: string): Promise<ConfirmResult> {
  const rows = await createTasks(context.actor, context.userId, inputs, source, note, requestId);
  return { ok: true, simulated: false, message: `${rows.length} ${rows.length === 1 ? 'task' : 'tasks'} added to My Tasks` };
}
