import 'server-only';
import { z } from 'zod';
import { CrmError, type CrmAdapter, type CrmCompany, type CrmContact, type CrmHealth, type CrmListOptions, type CrmOpportunity, type CrmPage } from './types';

// Twenty CRM REST adapter (Twenty v2.44, the rsm-crm fork). Contract taken from the fork's source:
//   packages/twenty-server/src/engine/api/rest/core/controllers/rest-api-core.controller.ts  (GET /rest/{plural})
//   list envelope { data: { <plural>: [...] }, totalCount, pageInfo { hasNextPage, endCursor } }
//   single envelope { data: { <singular>: {...} } }; cursor pagination via `starting_after`; limit ≤ 200
//   Authorization: Bearer <workspace API key>; filter=field[op]:value with and()/or() conjunctions.
// Read-only by design for this release; writes will go through confirmed, audited RedSky actions.

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

export class TwentyCrmAdapter implements CrmAdapter {
  readonly provider = 'twenty';

  constructor(
    private readonly baseUrl: URL,
    private readonly apiKey: string,
    private readonly fetchImpl: FetchLike = fetch,
  ) {}

  private async request(path: string, params: Record<string, string> = {}): Promise<unknown> {
    const url = new URL(path, this.baseUrl);
    for (const [key, value] of Object.entries(params)) url.searchParams.set(key, value);
    let response: Response;
    try {
      response = await this.fetchImpl(url, {
        headers: { Authorization: `Bearer ${this.apiKey}`, Accept: 'application/json' },
        signal: AbortSignal.timeout(TIMEOUT_MS),
        cache: 'no-store',
      });
    } catch {
      throw new CrmError('unreachable', 'The CRM did not respond');
    }
    if (response.status === 401 || response.status === 403) throw new CrmError('unauthorized', 'The CRM rejected RedSky’s API key');
    if (response.status === 429) throw new CrmError('rate_limited', 'The CRM rate limit was reached');
    if (response.status === 404) return null;
    if (!response.ok) throw new CrmError('bad_response', `The CRM returned ${response.status}`);
    return response.json();
  }

  private async list<TItem>(plural: string, map: (raw: unknown) => TItem, options: CrmListOptions, filter?: string): Promise<CrmPage<TItem>> {
    const params: Record<string, string> = { limit: String(Math.min(options.limit ?? 50, MAX_LIMIT)), depth: '1' };
    if (options.cursor) params.starting_after = options.cursor;
    if (filter) params.filter = filter;
    const body = z
      .object({ data: z.record(z.string(), z.array(z.unknown())), totalCount: z.number().optional(), pageInfo: pageInfoSchema })
      .safeParse(await this.request(`/rest/${plural}`, params));
    if (!body.success) throw new CrmError('bad_response', `Unexpected ${plural} response`);
    const rows = body.data.data[plural] ?? [];
    return { items: rows.map(map), nextCursor: body.data.pageInfo?.hasNextPage ? (body.data.pageInfo.endCursor ?? null) : null, totalCount: body.data.totalCount ?? null };
  }

  private async get<TItem>(plural: string, singular: string, id: string, map: (raw: unknown) => TItem): Promise<TItem | null> {
    if (!/^[0-9a-f-]{36}$/i.test(id)) return null;
    const body = await this.request(`/rest/${plural}/${id}`, { depth: '1' });
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
    return this.list('companies', mapCompany, options, term ? `name[ilike]:"%${term}%"` : undefined);
  }

  getCompany(id: string) {
    return this.get('companies', 'company', id, mapCompany);
  }

  listOpportunities(options: CrmListOptions = {}) {
    return this.list('opportunities', mapOpportunity, options);
  }
}
