import 'server-only';
import { DEPARTMENTS, OFFICES } from '@/features/personalization/catalog';
import { DEMO_PERSONAS, type DemoPersona } from '@/demo/personas';
import type { DirectorySource } from '@/server/db/schema';
import { ensureWorkspace, syncDirectoryEmail, upsertUser, type WorkspaceSeed } from '@/server/services/user-service';
import type { EntraIdentity } from './entra';
import { getConfig } from '@/server/config/env';
import type { DemoPersonaId } from '@/features/preferences/schema';

export async function provisionEntraUser(identity: EntraIdentity): Promise<string> {
  const entra = getConfig().auth.entra;
  const accessRole = entra && identity.roles.includes(entra.adminRole) ? 'admin' : 'member';
  const userId = await upsertUser({ provider: 'entra', subject: identity.oid, tenantId: identity.tenantId, email: identity.email, displayName: identity.displayName, accessRole });
  const directory = identity.directory;
  const department = directory?.department && (DEPARTMENTS as ReadonlyArray<string>).includes(directory.department) ? directory.department : '';
  const office = directory?.officeLocation && OFFICES.some((option) => option.value === directory.officeLocation) ? directory.officeLocation : '';
  const firstName = directory?.givenName ?? identity.displayName.split(' ')[0] ?? '';
  const source: DirectorySource = {
    firstName: directory?.givenName ? 'entra' : 'missing',
    lastName: directory?.surname ? 'entra' : 'missing',
    title: directory?.jobTitle ? 'entra' : 'missing',
    email: 'entra',
    ...(department ? { department: 'entra' as const } : {}),
  };
  const seed: WorkspaceSeed = {
    profile: {
      firstName,
      lastName: directory?.surname ?? '',
      preferredName: firstName,
      title: directory?.jobTitle ?? '',
      department,
      email: identity.email,
      phone: directory?.mobilePhone ?? directory?.businessPhones[0] ?? '',
      office,
      monogramTone: 1,
      directorySource: source,
    },
  };
  await ensureWorkspace(userId, seed);
  await syncDirectoryEmail(userId, identity.email);
  return userId;
}

// Development-only personas (the prototype's demo profiles). Callers must check auth mode first.
export async function provisionDevUser(personaId: DemoPersonaId): Promise<string> {
  const persona: DemoPersona = DEMO_PERSONAS[personaId];
  const displayName = [persona.first, persona.last].filter(Boolean).join(' ');
  const userId = await upsertUser({ provider: 'dev', subject: persona.id, tenantId: null, email: persona.email, displayName, accessRole: 'member' });
  await ensureWorkspace(userId, {
    profile: {
      firstName: persona.first,
      lastName: persona.last,
      preferredName: persona.first,
      title: persona.title,
      department: persona.department,
      email: persona.email,
      phone: '',
      office: persona.office,
      monogramTone: persona.tone,
      directorySource: { firstName: 'entra', lastName: persona.last ? 'entra' : 'missing', title: 'entra', email: 'entra' },
    },
    focusAreas: persona.focusAreas,
    preferences: {
      goals: persona.goals,
      landing: persona.landing,
      density: persona.density,
      aiStyle: persona.aiStyle,
      notifications: persona.notifications,
      demoPersona: persona.id,
    },
  });
  return userId;
}
