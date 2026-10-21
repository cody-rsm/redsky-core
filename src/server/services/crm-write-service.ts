import 'server-only';
import { and, eq } from 'drizzle-orm';
import { splitFullName, type ContactInput, type addContactSchema, type addNoteSchema } from '@/features/crm/schema';
import type { CrmContactReview, CrmWriteResult } from '@/lib/api/contracts';
import type { z } from 'zod';
import { getConfig } from '@/server/config/env';
import { getDb } from '@/server/db/client';
import { crmWrites } from '@/server/db/schema';
import { HttpError, unavailable } from '@/server/http/errors';
import { crmAccessFor } from '@/server/integrations/crm';
import { CrmError, type CrmAdapter } from '@/server/integrations/crm/types';
import { recordAudit } from '@/server/security/audit';

// Writes to the CRM as the signed-in person (DECISIONS.md 16): Twenty decides whether their role allows it and
// records them as the author. RedSky adds the review before a contact is created, once-only saves, and its audit log.

type AddContactRequest = z.infer<typeof addContactSchema>;
type AddNoteRequest = z.infer<typeof addNoteSchema>;

async function writableCrm(userId: string): Promise<CrmAdapter> {
  // A shared key has no person behind it, so it never writes (DECISIONS.md 16).
  if (getConfig().crm.access !== 'per_user') throw unavailable('Saving to the CRM needs your own CRM connection, which isn’t set up yet.');
  const access = await crmAccessFor(userId);
  if (access.status !== 'ok') throw unavailable('Connect to the RSM CRM first, from People › Connect CRM.');
  return access.adapter;
}

function crmFailure(error: unknown, what: string): never {
  if (error instanceof HttpError) throw error;
  if (error instanceof CrmError) {
    if (error.kind === 'forbidden') throw new HttpError(403, 'crm_forbidden', `Your CRM role doesn’t allow ${what}.`);
    if (error.kind === 'unauthorized') throw new HttpError(409, 'crm_reconnect', 'The CRM didn’t accept your connection. Reconnect it in Settings › Connected apps.');
    if (error.kind === 'invalid') throw new HttpError(400, 'crm_invalid', error.message);
    if (error.kind === 'rate_limited') throw new HttpError(429, 'rate_limited', 'The CRM is busy. Please try again in a minute.');
  }
  throw new HttpError(502, 'crm_unavailable', 'The CRM could not be reached. Nothing was saved; please try again.');
}

export async function reviewContact(userId: string, input: ContactInput): Promise<CrmContactReview> {
  const crm = await writableCrm(userId);
  const { firstName, lastName } = splitFullName(input.fullName);
  try {
    const [duplicates, organizations] = await Promise.all([
      crm.findDuplicateContacts({ firstName, lastName, email: input.email }),
      input.organization ? crm.findCompaniesByName(input.organization, 5) : Promise.resolve([]),
    ]);
    return {
      duplicates: duplicates.slice(0, 5).map((contact) => ({ id: contact.id, name: contact.fullName, email: contact.email, organization: contact.companyName })),
      organizations: organizations.map((company) => ({ id: company.id, name: company.name, domain: company.domain })),
    };
  } catch (error) {
    crmFailure(error, 'looking up contacts');
  }
}

// Claims the request key; returns the record a previous attempt with the same key already created, if any.
async function claim(userId: string, requestKey: string, kind: 'contact' | 'note'): Promise<{ claimed: true } | { claimed: false; recordId: string }> {
  const [row] = await getDb().insert(crmWrites).values({ userId, requestKey, kind }).onConflictDoNothing().returning({ id: crmWrites.id });
  if (row) return { claimed: true };
  const [existing] = await getDb()
    .select({ recordId: crmWrites.recordId })
    .from(crmWrites)
    .where(and(eq(crmWrites.userId, userId), eq(crmWrites.requestKey, requestKey)))
    .limit(1);
  if (existing?.recordId) return { claimed: false, recordId: existing.recordId };
  throw new HttpError(409, 'in_progress', 'This is already being saved.');
}

async function settle(userId: string, requestKey: string, recordId: string | null): Promise<void> {
  const where = and(eq(crmWrites.userId, userId), eq(crmWrites.requestKey, requestKey));
  // A failed write releases its claim, so trying again is possible.
  if (recordId) await getDb().update(crmWrites).set({ recordId }).where(where);
  else await getDb().delete(crmWrites).where(where);
}

export async function addContact(userId: string, request: AddContactRequest, requestId: string): Promise<CrmWriteResult> {
  const crm = await writableCrm(userId);
  const claimed = await claim(userId, request.requestKey, 'contact');
  if (!claimed.claimed) return { id: claimed.recordId, message: `${request.fullName} is already in the CRM` };

  let companyId: string | null = null;
  let createdCompany = false;
  try {
    if (request.organizationId) {
      // Checked as the person, so they can only attach someone to an organization they may see.
      const company = await crm.getCompany(request.organizationId);
      if (!company) throw new HttpError(400, 'bad_request', 'That organization is not in the CRM, or you can’t see it.');
      companyId = company.id;
    } else if (request.createOrganization && request.organization) {
      companyId = (await crm.createCompany({ name: request.organization })).id;
      createdCompany = true;
    }
    const contact = await crm.createContact({ ...splitFullName(request.fullName), email: request.email, jobTitle: request.jobTitle, companyId });
    let noteAdded = false;
    if (request.note) {
      await crm.addNote({ body: request.note, target: { kind: 'contact', id: contact.id } });
      noteAdded = true;
    }
    await settle(userId, request.requestKey, contact.id);
    await recordAudit({ actorUserId: userId, action: 'crm.contact_added', resourceType: 'crm_person', resourceId: contact.id, requestId, metadata: { companyId, createdCompany, noteAdded } });
    return { id: contact.id, message: `${contact.fullName} added to the CRM` };
  } catch (error) {
    await settle(userId, request.requestKey, null);
    crmFailure(error, 'adding contacts');
  }
}

export async function addNote(userId: string, request: AddNoteRequest, requestId: string): Promise<CrmWriteResult> {
  const crm = await writableCrm(userId);
  const claimed = await claim(userId, request.requestKey, 'note');
  if (!claimed.claimed) return { id: claimed.recordId, message: 'Note already added' };
  try {
    // Checked as the person first: Twenty would otherwise accept a note linked to a record they can't see.
    const target = request.target.kind === 'contact' ? await crm.getContact(request.target.id) : await crm.getCompany(request.target.id);
    if (!target) throw new HttpError(404, 'not_found', 'That record is not in the CRM, or you can’t see it.');
    const note = await crm.addNote({ title: request.title, body: request.body, target: request.target });
    await settle(userId, request.requestKey, note.id);
    await recordAudit({ actorUserId: userId, action: 'crm.note_added', resourceType: 'crm_note', resourceId: note.id, requestId, metadata: { targetKind: request.target.kind, targetId: request.target.id } });
    return { id: note.id, message: 'Note added' };
  } catch (error) {
    await settle(userId, request.requestKey, null);
    crmFailure(error, 'adding notes');
  }
}
