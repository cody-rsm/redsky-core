import 'server-only';
import { eq } from 'drizzle-orm';
import { initialsFromName } from '@/components/ui/avatar';
import { DEMO_PERSONA_ORDER, DEMO_PERSONAS, DEMO_TODAY_LABEL } from '@/demo/personas';
import type { ConnectorId } from '@/features/integrations/catalog';
import type { FocusAreaId } from '@/features/personalization/catalog';
import { DEFAULT_PREFERENCES, preferencesSchema } from '@/features/preferences/schema';
import type { ProfileView, ViewerPayload, WorkstyleSummary } from '@/lib/api/contracts';
import type { SessionUser } from '@/server/auth/session';
import { getConfig, getPublicConfig } from '@/server/config/env';
import { getDb } from '@/server/db/client';
import { crmConnectionState } from '@/server/integrations/crm';
import { dashboardLayouts, employeeProfiles, integrationRequests, onboardingProgress, userPreferences, workstyleAssessments } from '@/server/db/schema';

export async function loadViewer(user: SessionUser): Promise<ViewerPayload> {
  const db = getDb();
  const [profileRows, prefRows, layoutRows, progressRows, integrationRows, workstyleRows, crm] = await Promise.all([
    db.select().from(employeeProfiles).where(eq(employeeProfiles.userId, user.id)).limit(1),
    db.select().from(userPreferences).where(eq(userPreferences.userId, user.id)).limit(1),
    db.select().from(dashboardLayouts).where(eq(dashboardLayouts.userId, user.id)).limit(1),
    db.select().from(onboardingProgress).where(eq(onboardingProgress.userId, user.id)).limit(1),
    db.select().from(integrationRequests).where(eq(integrationRequests.userId, user.id)),
    db
      .select({
        extraction: workstyleAssessments.extraction,
        reviewedAt: workstyleAssessments.reviewedAt,
        recommendations: workstyleAssessments.recommendations,
      })
      .from(workstyleAssessments)
      .where(eq(workstyleAssessments.userId, user.id))
      .limit(1),
    crmConnectionState(user.id),
  ]);
  const profile = profileRows[0];
  const progress = progressRows[0];
  // Stored preferences are validated on read so a schema change can never crash the client.
  const parsedPreferences = preferencesSchema.safeParse({ ...DEFAULT_PREFERENCES, ...prefRows[0]?.preferences });
  const preferences = parsedPreferences.success ? parsedPreferences.data : DEFAULT_PREFERENCES;
  const workstyle = workstyleRows[0];
  const config = getConfig();

  const profileView: ProfileView = {
    firstName: profile?.firstName ?? '',
    lastName: profile?.lastName ?? '',
    preferredName: profile?.preferredName ?? '',
    title: profile?.title ?? '',
    department: profile?.department ?? '',
    email: profile?.email ?? user.email,
    phone: profile?.phone ?? '',
    office: profile?.office ?? '',
    bio: profile?.bio ?? '',
    monogramTone: profile?.monogramTone ?? 1,
    photoVersion: profile?.photo ? String(profile.updatedAt.getTime()) : null,
    focusAreas: (profile?.focusAreas ?? []) as FocusAreaId[],
    directorySource: profile?.directorySource ?? {},
  };

  const workstyleSummary: WorkstyleSummary = {
    present: Boolean(workstyle),
    reviewed: Boolean(workstyle?.reviewedAt),
    consentGiven: Boolean(workstyle),
    status: workstyle?.extraction.status ?? null,
    acceptedCount: workstyle?.recommendations ? Object.values(workstyle.recommendations).filter((rec) => rec.status === 'accepted').length : 0,
  };

  const integrations: ViewerPayload['integrations'] = {};
  for (const row of integrationRows) integrations[row.connectorId as ConnectorId] = row.state;

  const activePersona = preferences.demoPersona ?? (user.authProvider === 'dev' && user.authSubject in DEMO_PERSONAS ? (user.authSubject as keyof typeof DEMO_PERSONAS) : 'ga');

  return {
    user: { id: user.id, displayName: user.displayName, email: user.email, accessRole: user.accessRole, authProvider: user.authProvider },
    profile: profileView,
    preferences,
    layout: { layout: layoutRows[0]?.layout ?? [], layoutTouched: layoutRows[0]?.layoutTouched ?? false },
    onboarding: { currentStep: progress?.currentStep ?? 0, maxStep: progress?.maxStep ?? 0, completed: Boolean(progress?.completedAt) },
    integrations,
    workstyle: workstyleSummary,
    config: getPublicConfig(),
    crm,
    demo:
      config.dataMode === 'demo'
        ? {
            activePersona,
            switchesUser: config.auth.mode === 'dev',
            todayLabel: DEMO_TODAY_LABEL,
            personas: DEMO_PERSONA_ORDER.map((id) => {
              const persona = DEMO_PERSONAS[id];
              const name = [persona.first, persona.last].filter(Boolean).join(' ');
              return { id, name, initials: initialsFromName(name), tone: persona.tone, label: persona.label, title: persona.title, primary: persona.primary };
            }),
          }
        : null,
  };
}

export async function isOnboardingComplete(userId: string): Promise<boolean> {
  const rows = await getDb().select({ completedAt: onboardingProgress.completedAt }).from(onboardingProgress).where(eq(onboardingProgress.userId, userId)).limit(1);
  return Boolean(rows[0]?.completedAt);
}
