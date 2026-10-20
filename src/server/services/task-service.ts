import 'server-only';
import { and, desc, eq, gt, isNull, or, sql } from 'drizzle-orm';
import { z } from 'zod';
import { RECORD_KINDS } from '@/features/ai/types';
import { resolveDueLabel, todayIn } from '@/lib/dates/due';
import { getConfig } from '@/server/config/env';
import { getDb } from '@/server/db/client';
import { tasks } from '@/server/db/schema';
import { notFound } from '@/server/http/errors';
import { assertAuthorized, type Actor } from '@/server/security/access-policy';
import { recordAudit } from '@/server/security/audit';

export const taskInputSchema = z.object({
  title: z.string().trim().min(1, 'Enter a task').max(300),
  related: z.string().trim().max(200).optional(),
  relatedRecord: z.object({ kind: z.enum(RECORD_KINDS), id: z.string().max(200) }).nullable().optional(),
  due: z.string().trim().max(40).optional(),
  priority: z.enum(['high', 'med', 'low']).optional(),
  notes: z.string().trim().max(1000).optional(),
});
export type TaskInput = z.infer<typeof taskInputSchema>;

export type TaskRow = typeof tasks.$inferSelect;
type TaskSource = TaskRow['source'];

const RECENTLY_COMPLETED_MS = 24 * 3600 * 1000;

// Open tasks plus anything completed in the last day (shown struck through, as in the prototype).
export async function listTasks(actor: Actor, userId: string): Promise<TaskRow[]> {
  assertAuthorized(actor, 'read', { type: 'own', ownerId: userId });
  return getDb()
    .select()
    .from(tasks)
    .where(
      and(
        eq(tasks.ownerId, userId),
        isNull(tasks.dismissedAt),
        or(eq(tasks.status, 'open'), gt(tasks.completedAt, new Date(Date.now() - RECENTLY_COMPLETED_MS))),
      ),
    )
    .orderBy(desc(tasks.createdAt))
    .limit(200);
}

export async function createTasks(actor: Actor, userId: string, inputs: TaskInput[], source: TaskSource, sourceNote: string, requestId: string): Promise<TaskRow[]> {
  assertAuthorized(actor, 'write', { type: 'own', ownerId: userId });
  const today = todayIn(getConfig().timeZone);
  const rows = await getDb()
    .insert(tasks)
    .values(
      inputs.map((input) => ({
        ownerId: userId,
        title: input.title,
        relatedLabel: input.related ?? '',
        relatedKind: input.relatedRecord?.kind ?? null,
        relatedId: input.relatedRecord?.id ?? null,
        dueOn: resolveDueLabel(input.due, today),
        priority: input.priority ?? (input.due?.toLowerCase().startsWith('today') ? 'high' : 'med'),
        source,
        sourceNote: input.notes ? `${sourceNote} · ${input.notes}`.slice(0, 1000) : sourceNote,
      })),
    )
    .returning();
  await recordAudit({ actorUserId: userId, action: 'task.created', resourceType: 'task', outcome: 'success', requestId, metadata: { count: rows.length, source } });
  return rows;
}

export async function updateTask(actor: Actor, userId: string, taskId: string, patch: { done?: boolean; dismissed?: boolean }): Promise<TaskRow> {
  assertAuthorized(actor, 'write', { type: 'own', ownerId: userId });
  const set: Partial<typeof tasks.$inferInsert> = { updatedAt: new Date() };
  if (patch.done !== undefined) {
    set.status = patch.done ? 'done' : 'open';
    set.completedAt = patch.done ? new Date() : null;
  }
  if (patch.dismissed !== undefined) set.dismissedAt = patch.dismissed ? new Date() : null;
  // The owner filter is the object-level check: another user's task id simply matches nothing.
  const [row] = await getDb().update(tasks).set(set).where(and(eq(tasks.id, taskId), eq(tasks.ownerId, userId))).returning();
  if (!row) throw notFound('Task not found');
  return row;
}

export async function countOpenTasks(userId: string): Promise<number> {
  const [row] = await getDb()
    .select({ count: sql<number>`count(*)::int` })
    .from(tasks)
    .where(and(eq(tasks.ownerId, userId), eq(tasks.status, 'open'), isNull(tasks.dismissedAt)));
  return row?.count ?? 0;
}
