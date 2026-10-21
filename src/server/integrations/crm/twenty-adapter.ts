import 'server-only';
import { z } from 'zod';
import { CrmError, type CrmAdapter, type CrmCompany, type CrmContact, type CrmHealth, type CrmListOptions, type CrmNoteTarget, type CrmOpportunity, type CrmPage, type NewCrmContact } from './types';

// Twenty CRM REST adapter (Twenty v2.44, the cody-rsm/redsky-twenty fork). Contract taken from the fork's source:
//   packages/twenty-server/src/engine/api/rest/core/controllers/rest-api-core.controller.ts  (GET /rest/{plural})
//   list envelope { data: { <plural>: [...] }, totalCount, pageInfo { hasNextPage, endCursor } }
//   single envelope { data: { <singular>: {...} } }; cursor pagination via `starting_after`; limit ≤ 200
//   Authorization: Bearer <token>; filter=field[op]:value with and()/or() conjunctions.
// Writes (rest-api-create-one.handler.ts, rest-api-find-duplicates.handler.ts): POST /rest/{plural} with the plain
// record, 201 { data: { create<Singular>: {...} } }; POST /rest/{plural}/duplicates { data: [partial] }, 200
// { data: [{ <singular>Duplicates: [...] }] }. Errors are { messages: [...], code? }; a permission denial is a 400
// with code PERMISSION_DENIED, not a 403.

const MAX_LIMIT = 200;
const TIMEOUT_MS = 8000;

const nullableString = z.string().nullish().transform((value) => value ?? null);

const personSchema = z
  .object({
    id: z.string(),
    name: z.object({ firstName: nullableString, lastName: nullableString }).nullish(),
    emails: z.object({ primaryEmail: nullableString }).nullish(),
    phones: z.object({ primaryPhoneNumber: nullableString, primaryPhoneCallingCode: nullableString }).nullish(),
    jobTitle: nullableString,
    companyId: nullableString,
    company: z.object({ name: nullableString }).nullish(),
    location: nullableString,
    relationshipStrength: z.number().nullish(),
    lastInteractionAt: nullableString,
    sensitivity: nullableString,
    doNotContact: z.boolean().nullish(),
    updatedAt: nullableString,
  })
  .passthrough();

const companySchema = z
  .object({
    id: z.string(),
    name: nullableString,
    domainName: z.object({ primaryLinkUrl: nullableString }).nullish(),
    address: z.object({ addressCity: nullableString }).nullish(),
    description: nullableString,
    updatedAt: nullableString,
  })
  .passthrough();

const opportunitySchema = z
  .object({
    id: z.string(),
    name: nullableString,
    amount: z.object({ amountMicros: z.union([z.number(), z.string()]).nullish(), currencyCode: nullableString }).nullish(),
    stage: nullableString,
    closeDate: nullableString,
    companyId: nullableString,
    pointOfContactId: nullableString,
  })
  .passthrough();

const pageInfoSchema = z.object({ hasNextPage: z.boolean().optional(), endCursor: z.string().nullish() }).nullish();

export function mapPerson(raw: unknown): CrmContact {
  const person = personSchema.parse(raw);
  const firstName = person.name?.firstName ?? '';
  const lastName = person.name?.lastName ?? '';
  const phoneNumber = person.phones?.primaryPhoneNumber;
  return {
    id: person.id,
    firstName,
    lastName,
    fullName: [firstName, lastName].filter(Boolean).join(' ') || '(no name)',
    email: person.emails?.primaryEmail ?? null,
    phone: phoneNumber ? [person.phones?.primaryPhoneCallingCode, phoneNumber].filter(Boolean).join(' ') : null,
    jobTitle: person.jobTitle,
    companyId: person.companyId,
    companyName: person.company?.name ?? null,
    location: person.location,
    relationshipStrength: person.relationshipStrength ?? null,
    lastInteractionAt: person.lastInteractionAt,
    sensitivity: person.sensitivity,
    doNotContact: person.doNotContact ?? null,
    updatedAt: person.updatedAt,
  };
}

export function mapCompany(raw: unknown): CrmCompany {
  const company = companySchema.parse(raw);
  return {
    id: company.id,
    name: company.name ?? '(unnamed company)',
    domain: company.domainName?.primaryLinkUrl ?? null,
    city: company.address?.addressCity ?? null,
    description: company.description,
    updatedAt: company.updatedAt,
  };
}

export function mapOpportunity(raw: unknown): CrmOpportunity {
  const opportunity = opportunitySchema.parse(raw);
  const micros = opportunity.amount?.amountMicros;
  const value = micros === null || micros === undefined ? null : Number(micros) / 1_000_000;
  return {
    id: opportunity.id,
    name: opportunity.name ?? '(unnamed opportunity)',
    amount: value !== null && Number.isFinite(value) && opportunity.amount?.currencyCode ? { value, currency: opportunity.amount.currencyCode } : null,
    stage: opportunity.stage ?? 'NEW',
    closeDate: opportunity.closeDate,
    companyId: opportunity.companyId,
    pointOfContactId: opportunity.pointOfContactId,
  };
}

// Twenty's filter grammar has no escaping: commas split values and parentheses delimit conjunctions.
export function sanitizeSearchTerm(term: string): string {
  return term.replace(/[,()"'\\%_]/g, ' ').replace(/\s+/g, ' ').trim().slice(0, 60);
}

type FetchLike = typeof fetch;

const errorBodySchema = z.object({ messages: z.array(z.string()).optional(), code: z.string().optional() }).passthrough();

// Twenty answers a refused write with 400 and a message; turns it into what the person can act on.
function rejection(body: unknown): CrmError {
  const parsed = errorBodySchema.safeParse(body);
  const message = parsed.success ? (parsed.data.messages?.[0] ?? '') : '';
  if ((parsed.success && parsed.data.code === 'PERMISSION_DENIED') || /does not have permission/i.test(message)) return new CrmError('forbidden', 'Your CRM role does not allow this');
  if (/duplicate entry/i.test(message)) return new CrmError('invalid', 'Another CRM record already uses that email address or website.');
  return new CrmError('invalid', message ? `The CRM refused this: ${message.slice(0, 200)}` : 'The CRM refused this request.');
}

const createdSchema = z.object({ data: z.record(z.string(), z.unknown()) });

export class TwentyCrmAdapter implements CrmAdapter {
  readonly provider = 'twenty';

  constructor(
    private readonly baseUrl: URL,
    // A person's OAuth access token, or the stopgap shared API key; Twenty takes both as a bearer token.
    private readonly credential: string,
    private readonly fetchImpl: FetchLike = fetch,
  ) {}

  private async send(method: 'GET' | 'POST' | 'DELETE', path: string, params: Record<string, string> = {}, body?: unknown): Promise<unknown> {
    const url = new URL(path, this.baseUrl);
    for (const [key, value] of Object.entries(params)) url.searchParams.set(key, value);
    let response: Response;
    try {
      response = await this.fetchImpl(url, {
        method,
        headers: { Authorization: `Bearer ${this.credential}`, Accept: 'application/json', ...(body === undefined ? {} : { 'Content-Type': 'application/json' }) },
        body: body === undefined ? undefined : JSON.stringify(body),
        signal: AbortSignal.timeout(TIMEOUT_MS),
        cache: 'no-store',
      });
    } catch {
      throw new CrmError('unreachable', 'The CRM did not respond');
    }
    // A 403 means the token itself was refused on this route; a role denying the operation is a 400 (below).
    if (response.status === 401 || response.status === 403) throw new CrmError('unauthorized', 'The CRM rejected the credential');
    if (response.status === 429) throw new CrmError('rate_limited', 'The CRM rate limit was reached');
    if (response.status === 404 && method === 'GET') return null;
    if (response.status === 400) throw rejection(await response.json().catch(() => null));
    if (!response.ok) throw new CrmError('bad_response', `The CRM returned ${response.status}`);
    return response.json();
  }

  private request(path: string, params: Record<string, string> = {}): Promise<unknown> {
    return this.send('GET', path, params);
  }

  private async list<TItem>(plural: string, map: (raw: unknown) => TItem, options: CrmListOptions, filter?: string, depth: '0' | '1' = '1'): Promise<CrmPage<TItem>> {
    const params: Record<string, string> = { limit: String(Math.min(options.limit ?? 50, MAX_LIMIT)), depth };
    if (options.cursor) params.starting_after = options.cursor;
    if (filter) params.filter = filter;
    const body = z
      .object({ data: z.record(z.string(), z.array(z.unknown())), totalCount: z.number().optional(), pageInfo: pageInfoSchema })
      .safeParse(await this.request(`/rest/${plural}`, params));
    if (!body.success) throw new CrmError('bad_response', `Unexpected ${plural} response`);
    const rows = body.data.data[plural] ?? [];
    return { items: rows.map(map), nextCursor: body.data.pageInfo?.hasNextPage ? (body.data.pageInfo.endCursor ?? null) : null, totalCount: body.data.totalCount ?? null };
  }

  // depth 1 adds every related record Twenty lets the caller read (timeline, attachments…); ask for it only when a
  // relation is shown.
  private async get<TItem>(plural: string, singular: string, id: string, map: (raw: unknown) => TItem, depth: '0' | '1' = '1'): Promise<TItem | null> {
    if (!/^[0-9a-f-]{36}$/i.test(id)) return null;
    const body = await this.request(`/rest/${plural}/${id}`, { depth });
    if (body === null) return null;
    const parsed = z.object({ data: z.record(z.string(), z.unknown()) }).safeParse(body);
    const record = parsed.success ? parsed.data.data[singular] : undefined;
    return record ? map(record) : null;
  }

  async health(): Promise<CrmHealth> {
    try {
      await this.request('/rest/people', { limit: '1' });
      return 'ok';
    } catch (error) {
      return error instanceof CrmError && error.kind === 'unauthorized' ? 'unauthorized' : 'unreachable';
    }
  }

  listContacts(options: CrmListOptions = {}) {
    const term = options.search ? sanitizeSearchTerm(options.search) : '';
    const filter = term ? `or(name.firstName[ilike]:"%${term}%",name.lastName[ilike]:"%${term}%",emails.primaryEmail[ilike]:"%${term}%")` : undefined;
    return this.list('people', mapPerson, options, filter);
  }

  getContact(id: string) {
    return this.get('people', 'person', id, mapPerson);
  }

  listCompanies(options: CrmListOptions = {}) {
    const term = options.search ? sanitizeSearchTerm(options.search) : '';
    return this.list('companies', mapCompany, options, term ? `name[ilike]:"%${term}%"` : undefined, '0');
  }

  getCompany(id: string) {
    return this.get('companies', 'company', id, mapCompany, '0');
  }

  listOpportunities(options: CrmListOptions = {}) {
    return this.list('opportunities', mapOpportunity, options);
  }

  private async create<TItem>(plural: string, singular: string, record: Record<string, unknown>, map: (raw: unknown) => TItem): Promise<TItem> {
    const key = `create${singular.charAt(0).toUpperCase()}${singular.slice(1)}`;
    const parsed = createdSchema.safeParse(await this.send('POST', `/rest/${plural}`, {}, record));
    const created = parsed.success ? parsed.data.data[key] : undefined;
    if (!created) throw new CrmError('bad_response', `Unexpected ${singular} create response`);
    return map(created);
  }

  private async duplicates(plural: string, singular: string, record: Record<string, unknown>): Promise<unknown[]> {
    const body = z
      .object({ data: z.array(z.record(z.string(), z.unknown())) })
      .safeParse(await this.send('POST', `/rest/${plural}/duplicates`, { depth: '0' }, { data: [record] }));
    if (!body.success) throw new CrmError('bad_response', `Unexpected ${singular} duplicates response`);
    const found = body.data.data[0]?.[`${singular}Duplicates`];
    return Array.isArray(found) ? found : [];
  }

  // Twenty's own rules: the same email, LinkedIn URL, or exact first and last name (each at least 3 characters).
  async findDuplicateContacts(input: { firstName: string; lastName: string; email?: string }): Promise<CrmContact[]> {
    const record: Record<string, unknown> = { name: { firstName: input.firstName, lastName: input.lastName } };
    if (input.email) record.emails = { primaryEmail: input.email };
    const people = (await this.duplicates('people', 'person', record)).map(mapPerson);
    // Shown with their organization, looked up only for the few that are displayed.
    const names = new Map<string, string>();
    await Promise.all(
      [...new Set(people.slice(0, 5).flatMap((person) => (person.companyId ? [person.companyId] : [])))].map(async (id) => {
        const company = await this.getCompany(id);
        if (company) names.set(id, company.name);
      }),
    );
    return people.map((person) => ({ ...person, companyName: person.companyId ? (names.get(person.companyId) ?? null) : null }));
  }

  // Exact name, ignoring case (a filter with no wildcards), plus Twenty's own duplicate rule, which is exact and keeps
  // punctuation the filter grammar can't carry.
  async findCompaniesByName(name: string, limit: number): Promise<CrmCompany[]> {
    const term = sanitizeSearchTerm(name);
    const [byFilter, byRule] = await Promise.all([
      term ? this.list('companies', mapCompany, { limit }, `name[ilike]:"${term}"`, '0').then((page) => page.items) : Promise.resolve([]),
      this.duplicates('companies', 'company', { name: name.trim() }).then((rows) => rows.map(mapCompany)),
    ]);
    const unique = new Map<string, CrmCompany>();
    for (const company of [...byRule, ...byFilter]) unique.set(company.id, company);
    return [...unique.values()].slice(0, limit);
  }

  createCompany(input: { name: string }): Promise<CrmCompany> {
    return this.create('companies', 'company', { name: input.name }, mapCompany);
  }

  createContact(input: NewCrmContact): Promise<CrmContact> {
    const record: Record<string, unknown> = { name: { firstName: input.firstName, lastName: input.lastName } };
    if (input.email) record.emails = { primaryEmail: input.email };
    if (input.jobTitle) record.jobTitle = input.jobTitle;
    if (input.companyId) record.companyId = input.companyId;
    return this.create('people', 'person', record, mapPerson);
  }

  async addNote(input: { title?: string; body: string; target: CrmNoteTarget }): Promise<{ id: string }> {
    // Twenty builds the rich-text blocks from the markdown. Without a title, the first line stands in for one.
    const title = input.title ?? input.body.split('\n')[0]?.trim().slice(0, 80) ?? 'Note';
    const note = await this.create('notes', 'note', { title, bodyV2: { markdown: input.body } }, (raw) => z.object({ id: z.string() }).parse(raw));
    try {
      await this.create('noteTargets', 'noteTarget', { noteId: note.id, ...(input.target.kind === 'contact' ? { targetPersonId: input.target.id } : { targetCompanyId: input.target.id }) }, (raw) => z.object({ id: z.string() }).parse(raw));
    } catch (error) {
      // A note that can't be linked would sit unseen in the CRM; remove it and report the failure.
      await this.send('DELETE', `/rest/notes/${note.id}`).catch(() => undefined);
      throw error;
    }
    return note;
  }
}
