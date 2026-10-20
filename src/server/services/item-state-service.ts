import 'server-only';
import { and, eq, sql } from 'drizzle-orm';
import { getDb } from '@/server/db/client';
import { itemStates, type ItemState } from '@/server/db/schema';
import { assertAuthorized, type Actor } from '@/server/security/access-policy';

export type ItemSource = 'demo' | 'crm';

export async function loadItemStates(userId: string, source: ItemSource): Promise<Map<string, ItemState>> {
  const rows = await getDb().select().from(itemStates).where(and(eq(itemStates.userId, userId), eq(itemStates.source, source)));
  return new Map(rows.map((row) => [row.itemKey, row.state]));
}

export async function patchItemState(actor: Actor, userId: string, source: ItemSource, itemKey: string, patch: ItemState): Promise<ItemState> {
  assertAuthorized(actor, 'write', { type: 'own', ownerId: userId });
  const [existing] = await getDb()
    .select()
    .from(itemStates)
    .where(and(eq(itemStates.userId, userId), eq(itemStates.source, source), eq(itemStates.itemKey, itemKey)))
    .limit(1);
  const state: ItemState = { ...existing?.state, ...patch };
  await getDb()
    .insert(itemStates)
    .values({ userId, source, itemKey, state })
    .onConflictDoUpdate({ target: [itemStates.userId, itemStates.source, itemStates.itemKey], set: { state, updatedAt: sql`now()` } });
  return state;
}
