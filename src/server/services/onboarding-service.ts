import 'server-only';
import { eq, sql } from 'drizzle-orm';
import { ONBOARDING_STEP_COUNT, onboardingStepBlocker } from '@/features/onboarding/steps';
import { getDb } from '@/server/db/client';
import { employeeProfiles, onboardingProgress } from '@/server/db/schema';
import { badRequest } from '@/server/http/errors';
import { assertAuthorized, type Actor } from '@/server/security/access-policy';
import { recordAudit } from '@/server/security/audit';

async function loadState(userId: string) {
  const db = getDb();
  const [progress] = await db.select().from(onboardingProgress).where(eq(onboardingProgress.userId, userId)).limit(1);
  const [profile] = await db.select({ firstName: employeeProfiles.firstName, focusAreas: employeeProfiles.focusAreas }).from(employeeProfiles).where(eq(employeeProfiles.userId, userId)).limit(1);
  return { currentStep: progress?.currentStep ?? 0, maxStep: progress?.maxStep ?? 0, firstName: profile?.firstName ?? '', focusAreaCount: profile?.focusAreas.length ?? 0 };
}

// Moves to `step`. Steps already reached can be revisited; moving forward requires every step before it to be
// valid (first name on Profile, at least one focus area on Role), enforced here as well as in the UI.
export async function goToStep(actor: Actor, userId: string, step: number): Promise<{ currentStep: number; maxStep: number }> {
  assertAuthorized(actor, 'write', { type: 'own', ownerId: userId });
  if (!Number.isInteger(step) || step < 0 || step >= ONBOARDING_STEP_COUNT) throw badRequest('Unknown step');
  const state = await loadState(userId);
  if (step > state.maxStep + 1) throw badRequest('Complete the earlier steps first');
  for (let index = 0; index < step; index += 1) {
    const blocker = onboardingStepBlocker(index, { firstName: state.firstName, focusAreaCount: state.focusAreaCount });
    if (blocker) throw badRequest(blocker);
  }
  const maxStep = Math.max(state.maxStep, step);
  await getDb()
    .insert(onboardingProgress)
    .values({ userId, currentStep: step, maxStep })
    .onConflictDoUpdate({ target: onboardingProgress.userId, set: { currentStep: step, maxStep, updatedAt: sql`now()` } });
  return { currentStep: step, maxStep };
}

export async function completeOnboarding(actor: Actor, userId: string, requestId: string): Promise<void> {
  assertAuthorized(actor, 'write', { type: 'own', ownerId: userId });
  const state = await loadState(userId);
  for (let index = 0; index < ONBOARDING_STEP_COUNT - 1; index += 1) {
    const blocker = onboardingStepBlocker(index, { firstName: state.firstName, focusAreaCount: state.focusAreaCount });
    if (blocker) throw badRequest(blocker);
  }
  const last = ONBOARDING_STEP_COUNT - 1;
  await getDb()
    .update(onboardingProgress)
    .set({ currentStep: last, maxStep: last, completedAt: sql`now()`, updatedAt: sql`now()` })
    .where(eq(onboardingProgress.userId, userId));
  await recordAudit({ actorUserId: userId, action: 'onboarding.completed', resourceType: 'onboarding', resourceId: userId, requestId });
}

export async function restartOnboarding(actor: Actor, userId: string, requestId: string): Promise<void> {
  assertAuthorized(actor, 'write', { type: 'own', ownerId: userId });
  await getDb()
    .update(onboardingProgress)
    .set({ currentStep: 0, maxStep: 0, completedAt: null, updatedAt: sql`now()` })
    .where(eq(onboardingProgress.userId, userId));
  await recordAudit({ actorUserId: userId, action: 'onboarding.restarted', resourceType: 'onboarding', resourceId: userId, requestId });
}
