import 'server-only';
import { eq, sql } from 'drizzle-orm';
import type { FocusAreaId } from '@/features/personalization/catalog';
import { applyPreferencesPatch, type PreferencesState } from '@/features/preferences/apply';
import { DEFAULT_PREFERENCES, preferencesSchema, type PreferencesPatch } from '@/features/preferences/schema';
import { getDb } from '@/server/db/client';
import { dashboardLayouts, employeeProfiles, userPreferences } from '@/server/db/schema';
import { assertAuthorized, type Actor } from '@/server/security/access-policy';

export type { PreferencesState };

export async function loadPreferencesState(userId: string): Promise<PreferencesState> {
  const db = getDb();
  const [prefRows, layoutRows, profileRows] = await Promise.all([
    db.select().from(userPreferences).where(eq(userPreferences.userId, userId)).limit(1),
    db.select().from(dashboardLayouts).where(eq(dashboardLayouts.userId, userId)).limit(1),
    db.select({ focusAreas: employeeProfiles.focusAreas }).from(employeeProfiles).where(eq(employeeProfiles.userId, userId)).limit(1),
  ]);
  const parsed = preferencesSchema.safeParse({ ...DEFAULT_PREFERENCES, ...prefRows[0]?.preferences });
  return {
    preferences: parsed.success ? parsed.data : DEFAULT_PREFERENCES,
    layout: { layout: layoutRows[0]?.layout ?? [], layoutTouched: layoutRows[0]?.layoutTouched ?? false },
    focusAreas: (profileRows[0]?.focusAreas ?? []) as FocusAreaId[],
  };
}

export async function savePreferencesState(userId: string, state: PreferencesState): Promise<void> {
  await getDb().transaction(async (tx) => {
    await tx
      .insert(userPreferences)
      .values({ userId, preferences: state.preferences })
      .onConflictDoUpdate({ target: userPreferences.userId, set: { preferences: state.preferences, updatedAt: sql`now()` } });
    await tx
      .insert(dashboardLayouts)
      .values({ userId, layout: state.layout.layout, layoutTouched: state.layout.layoutTouched })
      .onConflictDoUpdate({ target: dashboardLayouts.userId, set: { layout: state.layout.layout, layoutTouched: state.layout.layoutTouched, updatedAt: sql`now()` } });
    await tx.update(employeeProfiles).set({ focusAreas: state.focusAreas, updatedAt: sql`now()` }).where(eq(employeeProfiles.userId, userId));
  });
}

export async function updatePreferences(actor: Actor, userId: string, patch: PreferencesPatch): Promise<PreferencesState> {
  assertAuthorized(actor, 'write', { type: 'own', ownerId: userId });
  const next = applyPreferencesPatch(await loadPreferencesState(userId), patch);
  await savePreferencesState(userId, next);
  return next;
}
