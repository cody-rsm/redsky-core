import 'server-only';
import { eq, sql } from 'drizzle-orm';
import { DEPARTMENT_FOCUS_AREAS, DEPARTMENTS, type Department, type FocusAreaId } from '@/features/personalization/catalog';
import { recommend } from '@/features/personalization/recommend';
import { DEFAULT_PREFERENCES, type WorkspacePreferences } from '@/features/preferences/schema';
import { getDb } from '@/server/db/client';
import { dashboardLayouts, employeeProfiles, onboardingProgress, userPreferences, users, type DirectorySource } from '@/server/db/schema';

export type IdentityInput = {
  provider: 'entra' | 'dev';
  subject: string;
  tenantId: string | null;
  email: string;
  displayName: string;
  accessRole: 'member' | 'admin';
};

export type WorkspaceSeed = {
  profile: {
    firstName: string;
    lastName: string;
    preferredName: string;
    title: string;
    department: string;
    email: string;
    phone: string;
    office: string;
    monogramTone: number;
    directorySource: DirectorySource;
  };
  focusAreas?: FocusAreaId[];
  preferences?: Partial<WorkspacePreferences>;
};

export async function upsertUser(identity: IdentityInput): Promise<string> {
  const [row] = await getDb()
    .insert(users)
    .values({ ...identity, authProvider: identity.provider, authSubject: identity.subject, lastLoginAt: new Date() })
    .onConflictDoUpdate({
      target: [users.authProvider, users.authSubject],
      set: { email: identity.email, displayName: identity.displayName, accessRole: identity.accessRole, tenantId: identity.tenantId, lastLoginAt: new Date(), updatedAt: new Date() },
    })
    .returning({ id: users.id });
  if (!row) throw new Error('User upsert returned no row');
  return row.id;
}

export function focusAreasForDepartment(department: string): FocusAreaId[] {
  return (DEPARTMENTS as ReadonlyArray<string>).includes(department) ? [...DEPARTMENT_FOCUS_AREAS[department as Department]] : [];
}

// Creates the per-user rows on first sign-in. Every insert is conflict-safe, so repeated sign-ins never create
// duplicates or overwrite choices the employee has already made.
export async function ensureWorkspace(userId: string, seed: WorkspaceSeed): Promise<void> {
  const db = getDb();
  const focusAreas = seed.focusAreas ?? focusAreasForDepartment(seed.profile.department);
  const preferences: WorkspacePreferences = { ...DEFAULT_PREFERENCES, ...seed.preferences };
  await db.transaction(async (tx) => {
    await tx.insert(employeeProfiles).values({ userId, ...seed.profile, focusAreas }).onConflictDoNothing();
    await tx.insert(userPreferences).values({ userId, preferences }).onConflictDoNothing();
    await tx
      .insert(dashboardLayouts)
      .values({ userId, layout: recommend(focusAreas, preferences.goals, preferences.density).layout, layoutTouched: false })
      .onConflictDoNothing();
    await tx.insert(onboardingProgress).values({ userId }).onConflictDoNothing();
  });
}

// Directory-managed fields follow the directory on every sign-in; everything else stays the employee's.
export async function syncDirectoryEmail(userId: string, email: string): Promise<void> {
  await getDb()
    .update(employeeProfiles)
    .set({ email, updatedAt: sql`now()` })
    .where(eq(employeeProfiles.userId, userId));
}
