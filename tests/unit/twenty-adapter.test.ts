import { describe, expect, it, vi } from 'vitest';
import { mapCompany, mapOpportunity, mapPerson, sanitizeSearchTerm, TwentyCrmAdapter } from '@/server/integrations/crm/twenty-adapter';

describe('Twenty record mapping', () => {
  it('maps a person, including composite name, email and phone fields', () => {
    const contact = mapPerson({
      id: 'p1',
      name: { firstName: 'Priya', lastName: 'Raman' },
      emails: { primaryEmail: 'priya@example.com' },
      phones: { primaryPhoneNumber: '555 0100', primaryPhoneCallingCode: '+1' },
      jobTitle: 'VP, Strategic Partnerships',
      companyId: 'c1',
      company: { name: 'Ridgeline Grid Storage' },
      unknownField: 'ignored',
    });
    expect(contact).toMatchObject({ id: 'p1', fullName: 'Priya Raman', email: 'priya@example.com', phone: '+1 555 0100', companyName: 'Ridgeline Grid Storage' });
  });

  it('tolerates missing optional fields', () => {
    expect(mapPerson({ id: 'p2' })).toMatchObject({ fullName: '(no name)', email: null, phone: null, companyName: null });
    expect(mapCompany({ id: 'c2' })).toMatchObject({ name: '(unnamed company)', domain: null });
  });

  it('converts amount micros and keeps stage', () => {
    expect(mapOpportunity({ id: 'o1', name: 'Series B', amount: { amountMicros: 12_500_000_000_000, currencyCode: 'USD' }, stage: 'MEETING' })).toMatchObject({
      amount: { value: 12_500_000, currency: 'USD' },
      stage: 'MEETING',
    });
    expect(mapOpportunity({ id: 'o2', amount: { amountMicros: null, currencyCode: 'USD' } }).amount).toBeNull();
  });

  it('rejects records without an id', () => {
    expect(() => mapPerson({ name: { firstName: 'X' } })).toThrow();
  });

  it('strips filter syntax from search terms', () => {
    expect(sanitizeSearchTerm('ridge,line) or(id[eq]:1')).toBe('ridge line or id[eq]:1');
    expect(sanitizeSearchTerm('a'.repeat(100))).toHaveLength(60);
  });
});

describe('TwentyCrmAdapter', () => {
  const response = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } });

  it('lists contacts with bearer auth, limit and cursor', async () => {
    const fetchMock = vi.fn().mockResolvedValue(response({ data: { people: [{ id: 'p1', name: { firstName: 'Ann', lastName: 'Lee' } }] }, pageInfo: { hasNextPage: true, endCursor: 'cur2' } }));
    const adapter = new TwentyCrmAdapter(new URL('https://crm.example.com'), 'secret-key', fetchMock);
    const page = await adapter.listContacts({ limit: 500, cursor: 'cur1' });
    expect(page.items[0]?.fullName).toBe('Ann Lee');
    expect(page.nextCursor).toBe('cur2');
    const [url, init] = fetchMock.mock.calls[0] as [URL | string, RequestInit];
    const target = new URL(url.toString());
    expect(target.pathname).toBe('/rest/people');
    expect(target.searchParams.get('limit')).toBe('200');
    expect(target.searchParams.get('starting_after')).toBe('cur1');
    expect(new Headers(init.headers).get('Authorization')).toBe('Bearer secret-key');
  });

  it('reports unauthorized responses as a typed error', async () => {
    const adapter = new TwentyCrmAdapter(new URL('https://crm.example.com'), 'bad', vi.fn().mockResolvedValue(response({ message: 'no' }, 401)));
    await expect(adapter.listContacts({ limit: 10 })).rejects.toMatchObject({ kind: 'unauthorized' });
  });
});

describe('TwentyCrmAdapter writes', () => {
  const response = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } });
  type Call = { method: string; path: string; search: URLSearchParams; body: unknown };
  // A fake Twenty answering by route, recording each request.
  function twenty(routes: Record<string, (call: Call) => Response>) {
    const calls: Call[] = [];
    const fetchMock = vi.fn(async (input: URL | RequestInfo, init?: RequestInit) => {
      const url = new URL(input.toString());
      const call = { method: init?.method ?? 'GET', path: url.pathname, search: url.searchParams, body: init?.body ? JSON.parse(String(init.body)) : undefined };
      calls.push(call);
      const route = routes[`${call.method} ${call.path}`];
      return route ? route(call) : response({}, 404);
    });
    return { adapter: new TwentyCrmAdapter(new URL('https://crm.example.com'), 'person-token', fetchMock), calls };
  }

  it('creates a person with Twenty’s composite fields and maps the result', async () => {
    const { adapter, calls } = twenty({ 'POST /rest/people': () => response({ data: { createPerson: { id: 'p9', name: { firstName: 'Jordan', lastName: 'Alvarez' }, emails: { primaryEmail: 'jordan@halcyon.example' }, companyId: 'c1' } } }, 201) });
    const contact = await adapter.createContact({ firstName: 'Jordan', lastName: 'Alvarez', email: 'jordan@halcyon.example', jobTitle: 'CFO', companyId: 'c1' });
    expect(contact).toMatchObject({ id: 'p9', fullName: 'Jordan Alvarez', email: 'jordan@halcyon.example', companyId: 'c1' });
    expect(calls[0]?.body).toEqual({ name: { firstName: 'Jordan', lastName: 'Alvarez' }, emails: { primaryEmail: 'jordan@halcyon.example' }, jobTitle: 'CFO', companyId: 'c1' });
  });

  it('asks Twenty for duplicates by its own rules and names their organizations', async () => {
    const companyId = '0b0e0c3a-6f1f-4b7e-9a51-6a3c1d2e4f5a';
    const { adapter, calls } = twenty({
      'POST /rest/people/duplicates': () => response({ data: [{ personDuplicates: [{ id: 'p1', name: { firstName: 'Jordan', lastName: 'Alvarez' }, emails: { primaryEmail: 'jordan@halcyon.example' }, companyId }], totalCount: 1 }] }),
      [`GET /rest/companies/${companyId}`]: () => response({ data: { company: { id: companyId, name: 'Halcyon Robotics' } } }),
    });
    const duplicates = await adapter.findDuplicateContacts({ firstName: 'Jordan', lastName: 'Alvarez', email: 'jordan@halcyon.example' });
    expect(calls[0]?.body).toEqual({ data: [{ name: { firstName: 'Jordan', lastName: 'Alvarez' }, emails: { primaryEmail: 'jordan@halcyon.example' } }] });
    expect(calls[0]?.search.get('depth')).toBe('0');
    expect(duplicates).toEqual([expect.objectContaining({ id: 'p1', fullName: 'Jordan Alvarez', companyName: 'Halcyon Robotics' })]);
  });

  it('finds organizations by exact name through both the filter and Twenty’s rule, once each', async () => {
    const halcyon = { id: 'c1', name: 'Halcyon Robotics', domainName: { primaryLinkUrl: 'halcyon.example' } };
    const { adapter, calls } = twenty({
      'GET /rest/companies': () => response({ data: { companies: [halcyon] }, pageInfo: { hasNextPage: false } }),
      'POST /rest/companies/duplicates': () => response({ data: [{ companyDuplicates: [halcyon] }] }),
    });
    const companies = await adapter.findCompaniesByName('Halcyon Robotics', 5);
    expect(companies).toEqual([expect.objectContaining({ id: 'c1', name: 'Halcyon Robotics', domain: 'halcyon.example' })]);
    const list = calls.find((call) => call.method === 'GET');
    expect(list?.search.get('filter')).toBe('name[ilike]:"Halcyon Robotics"');
    expect(list?.search.get('depth')).toBe('0');
  });

  it('adds a note with a markdown body, linked to the person', async () => {
    const { adapter, calls } = twenty({
      'POST /rest/notes': () => response({ data: { createNote: { id: 'n1' } } }, 201),
      'POST /rest/noteTargets': () => response({ data: { createNoteTarget: { id: 't1' } } }, 201),
    });
    await expect(adapter.addNote({ body: 'Met at the conference.\nFollow up in May.', target: { kind: 'contact', id: 'p1' } })).resolves.toEqual({ id: 'n1' });
    expect(calls[0]?.body).toEqual({ title: 'Met at the conference.', bodyV2: { markdown: 'Met at the conference.\nFollow up in May.' } });
    expect(calls[1]?.body).toEqual({ noteId: 'n1', targetPersonId: 'p1' });
  });

  it('removes a note it could not link, and reports the failure', async () => {
    const { adapter, calls } = twenty({
      'POST /rest/notes': () => response({ data: { createNote: { id: 'n1' } } }, 201),
      'POST /rest/noteTargets': () => response({ statusCode: 400, messages: ['Entity performing the request does not have permission'], code: 'PERMISSION_DENIED' }, 400),
      'DELETE /rest/notes/n1': () => response({ data: { deleteNote: { id: 'n1' } } }),
    });
    await expect(adapter.addNote({ body: 'x', target: { kind: 'company', id: 'c1' } })).rejects.toMatchObject({ kind: 'forbidden' });
    expect(calls.map((call) => `${call.method} ${call.path}`)).toEqual(['POST /rest/notes', 'POST /rest/noteTargets', 'DELETE /rest/notes/n1']);
  });

  it('turns Twenty’s 400 rejections into errors a person can act on', async () => {
    const denied = twenty({ 'POST /rest/people': () => response({ messages: ['Entity performing the request does not have permission'], code: 'PERMISSION_DENIED' }, 400) });
    await expect(denied.adapter.createContact({ firstName: 'A', lastName: 'B', companyId: null })).rejects.toMatchObject({ kind: 'forbidden' });
    const duplicate = twenty({ 'POST /rest/people': () => response({ messages: ['A duplicate entry was detected: unique constraint person.IDX_x was violated'] }, 400) });
    await expect(duplicate.adapter.createContact({ firstName: 'A', lastName: 'B', email: 'a@b.example', companyId: null })).rejects.toMatchObject({ kind: 'invalid', message: 'Another CRM record already uses that email address or website.' });
  });
});
