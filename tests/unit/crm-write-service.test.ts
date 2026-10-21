import { randomUUID } from 'node:crypto';
import { and, eq, inArray } from 'drizzle-orm';
import { afterAll, beforeEach, describe, expect, it, vi } from 'vitest';
import type { CrmCompany, CrmContact } from '@/server/integrations/crm/types';

// The CRM write service against a real, migrated RedSky database (REDSKY_TEST_DATABASE_URL, as in CI), with the
// CRM replaced by an in-memory fake. Skipped without a database.
const databaseUrl = process.env.REDSKY_TEST_DATABASE_URL;
if (databaseUrl) {
  Object.assign(process.env, {
    REDSKY_DATABASE_URL: databaseUrl,
    REDSKY_APP_URL: 'https://redsky.example.test',
    REDSKY_SESSION_SECRET: 's'.repeat(48),
    REDSKY_ENCRYPTION_KEY: Buffer.alloc(32, 9).toString('base64'),
    TWENTY_PUBLIC_URL: 'https://crm.example.test',
    TWENTY_OAUTH_CLIENT_ID: 'redsky-client',
    TWENTY_OAUTH_CLIENT_SECRET: 'redsky-secret',
  });
}

const crm = vi.hoisted(() => {
  const state = {
    connected: true,
    companies: new Map<string, { id: string; name: string }>(),
    people: new Map<string, { id: string; firstName: string; lastName: string; email?: string; companyId: string | null }>(),
    notes: [] as Array<{ id: string; body: string; target: { kind: string; id: string } }>,
    failCreateContact: null as null | Error,
  };
  return { state };
});

vi.mock('@/server/integrations/crm', async () => {
  const { CrmError } = await import('@/server/integrations/crm/types');
  const company = (row: { id: string; name: string }): CrmCompany => ({ id: row.id, name: row.name, domain: null, city: null, description: null, updatedAt: null });
  const contact = (row: { id: string; firstName: string; lastName: string; email?: string; companyId: string | null }): CrmContact => ({
    id: row.id,
    firstName: row.firstName,
    lastName: row.lastName,
    fullName: `${row.firstName} ${row.lastName}`.trim(),
    email: row.email ?? null,
    phone: null,
    jobTitle: null,
    companyId: row.companyId,
    companyName: row.companyId ? (crm.state.companies.get(row.companyId)?.name ?? null) : null,
    location: null,
    relationshipStrength: null,
    lastInteractionAt: null,
    sensitivity: null,
    doNotContact: null,
    updatedAt: null,
  });
  const adapter = {
    provider: 'fake',
    getCompany: async (id: string) => (crm.state.companies.has(id) ? company(crm.state.companies.get(id)!) : null),
    getContact: async (id: string) => (crm.state.people.has(id) ? contact(crm.state.people.get(id)!) : null),
    findDuplicateContacts: async (input: { email?: string }) => [...crm.state.people.values()].filter((person) => input.email && person.email === input.email).map(contact),
    findCompaniesByName: async (name: string) => [...crm.state.companies.values()].filter((row) => row.name.toLowerCase() === name.toLowerCase()).map(company),
    createCompany: async (input: { name: string }) => {
      const row = { id: randomUUID(), name: input.name };
      crm.state.companies.set(row.id, row);
      return company(row);
    },
    createContact: async (input: { firstName: string; lastName: string; email?: string; companyId: string | null }) => {
      if (crm.state.failCreateContact) throw crm.state.failCreateContact;
      const row = { id: randomUUID(), ...input };
      crm.state.people.set(row.id, row);
      return contact(row);
    },
    addNote: async (input: { body: string; target: { kind: string; id: string } }) => {
      const note = { id: randomUUID(), body: input.body, target: input.target };
      crm.state.notes.push(note);
      return { id: note.id };
    },
  };
  return {
    crmAccessFor: async () => (crm.state.connected ? { status: 'ok', adapter } : { status: 'connect_required' }),
    crmConnectionState: async () => (crm.state.connected ? 'connected' : 'connect_required'),
    CrmError,
  };
});

describe.skipIf(!databaseUrl)('CRM write service (database)', async () => {
  const { getDb } = await import('@/server/db/client');
  const { auditEvents, crmWrites, users } = await import('@/server/db/schema');
  const service = await import('@/server/services/crm-write-service');
  const { addContactSchema, addNoteSchema, contactInputSchema } = await import('@/features/crm/schema');
  const { CrmError } = await import('@/server/integrations/crm/types');

  const userIds: string[] = [];
  const newUser = async () => {
    const [user] = await getDb()
      .insert(users)
      .values({ authProvider: 'dev', authSubject: `crm-write-${randomUUID()}`, email: 'writer@example.com', displayName: 'Wendy Writer' })
      .returning();
    if (!user) throw new Error('user insert failed');
    userIds.push(user.id);
    return user.id;
  };
  // Parsed like the API parses a request body.
  const contactRequest = (overrides: Record<string, unknown> = {}) =>
    addContactSchema.parse({ requestKey: randomUUID(), fullName: 'Jordan Alvarez', email: 'jordan@halcyon.example', organization: 'Halcyon Robotics', organizationId: null, createOrganization: true, ...overrides });

  beforeEach(() => {
    crm.state.connected = true;
    crm.state.failCreateContact = null;
  });

  afterAll(async () => {
    await getDb().delete(auditEvents).where(inArray(auditEvents.actorUserId, userIds));
    await getDb().delete(users).where(inArray(users.id, userIds));
    await (globalThis as unknown as { redskyDb?: { sql: { end: () => Promise<void> } } }).redskyDb?.sql.end();
  });

  it('adds a contact with a new organization and a note, once, and audits it', async () => {
    const userId = await newUser();
    const request = contactRequest({ note: 'Met at the storage summit.' });
    const result = await service.addContact(userId, request, 'r1');
    expect(result.message).toBe('Jordan Alvarez added to the CRM');
    const person = crm.state.people.get(result.id);
    expect(person?.companyId && crm.state.companies.get(person.companyId)?.name).toBe('Halcyon Robotics');
    expect(crm.state.notes.find((note) => note.target.id === result.id)?.body).toBe('Met at the storage summit.');

    // The same request again (a double click or a retry) creates nothing new.
    const peopleBefore = crm.state.people.size;
    await expect(service.addContact(userId, request, 'r2')).resolves.toEqual({ id: result.id, message: 'Jordan Alvarez is already in the CRM' });
    expect(crm.state.people.size).toBe(peopleBefore);

    const audit = await getDb().select().from(auditEvents).where(and(eq(auditEvents.actorUserId, userId), eq(auditEvents.action, 'crm.contact_added')));
    expect(audit).toHaveLength(1);
    expect(audit[0]?.metadata).toMatchObject({ createdCompany: true, noteAdded: true });
  });

  it('links to an organization the person chose, and refuses one they can’t see', async () => {
    const userId = await newUser();
    const existing = { id: randomUUID(), name: 'Ridgeline Grid Storage' };
    crm.state.companies.set(existing.id, existing);
    const linked = await service.addContact(userId, contactRequest({ email: undefined, organization: existing.name, organizationId: existing.id, createOrganization: false }), 'r1');
    expect(crm.state.people.get(linked.id)?.companyId).toBe(existing.id);

    const companiesBefore = crm.state.companies.size;
    await expect(service.addContact(userId, contactRequest({ email: undefined, organizationId: randomUUID(), createOrganization: false }), 'r2')).rejects.toMatchObject({ status: 400 });
    expect(crm.state.companies.size).toBe(companiesBefore);
  });

  it('releases a failed save so it can be retried, and explains a refusal', async () => {
    const userId = await newUser();
    const request = contactRequest({ organization: undefined, createOrganization: false, email: undefined });
    crm.state.failCreateContact = new CrmError('forbidden', 'denied');
    await expect(service.addContact(userId, request, 'r1')).rejects.toMatchObject({ status: 403, message: 'Your CRM role doesn’t allow adding contacts.' });
    expect(await getDb().select().from(crmWrites).where(eq(crmWrites.userId, userId))).toHaveLength(0);

    crm.state.failCreateContact = null;
    await expect(service.addContact(userId, request, 'r2')).resolves.toMatchObject({ message: 'Jordan Alvarez added to the CRM' });
  });

  it('shows possible duplicates and existing organizations before adding', async () => {
    const userId = await newUser();
    const company = { id: randomUUID(), name: 'Atlas Transmission Co.' };
    crm.state.companies.set(company.id, company);
    crm.state.people.set(randomUUID(), { id: randomUUID(), firstName: 'Sam', lastName: 'Okafor', email: 'sam@atlas.example', companyId: company.id });
    const review = await service.reviewContact(userId, contactInputSchema.parse({ fullName: 'Samuel Okafor', email: 'sam@atlas.example', organization: 'atlas transmission co.' }));
    expect(review.duplicates).toEqual([expect.objectContaining({ name: 'Sam Okafor', email: 'sam@atlas.example', organization: 'Atlas Transmission Co.' })]);
    expect(review.organizations).toEqual([{ id: company.id, name: 'Atlas Transmission Co.', domain: null }]);
  });

  it('adds notes only to records the person can see, and only when connected', async () => {
    const userId = await newUser();
    const person = { id: randomUUID(), firstName: 'Elena', lastName: 'Sorensen', companyId: null };
    crm.state.people.set(person.id, person);
    const note = await service.addNote(userId, addNoteSchema.parse({ requestKey: randomUUID(), target: { kind: 'contact', id: person.id }, body: 'Interested in the Q3 site visit.' }), 'r1');
    expect(note.message).toBe('Note added');
    await expect(service.addNote(userId, addNoteSchema.parse({ requestKey: randomUUID(), target: { kind: 'contact', id: randomUUID() }, body: 'x' }), 'r2')).rejects.toMatchObject({ status: 404 });

    crm.state.connected = false;
    await expect(service.addNote(userId, addNoteSchema.parse({ requestKey: randomUUID(), target: { kind: 'contact', id: person.id }, body: 'x' }), 'r3')).rejects.toMatchObject({ status: 409, message: 'Connect to the RSM CRM first, from People › Connect CRM.' });
  });
});
