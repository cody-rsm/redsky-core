import { describe, expect, it, vi } from 'vitest';
import { mapCompany, mapOpportunity, mapPerson, sanitizeSearchTerm, TwentyCrmAdapter } from '@/server/integrations/crm/twenty-adapter';
import { CrmError } from '@/server/integrations/crm/types';

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

  // The signed-in person's tokens: `token-1` until a refresh is forced, then `token-2`.
  const personCredentials = () => vi.fn(async ({ forceRefresh }: { forceRefresh: boolean }) => (forceRefresh ? 'token-2' : 'token-1'));
  const authorization = (call: unknown) => new Headers((call as [URL, RequestInit])[1].headers).get('Authorization');

  it('lists contacts with the person’s bearer token, limit and cursor', async () => {
    const fetchMock = vi.fn().mockResolvedValue(response({ data: { people: [{ id: 'p1', name: { firstName: 'Ann', lastName: 'Lee' } }] }, pageInfo: { hasNextPage: true, endCursor: 'cur2' } }));
    const adapter = new TwentyCrmAdapter(new URL('https://crm.example.com'), personCredentials(), fetchMock);
    const page = await adapter.listContacts({ limit: 500, cursor: 'cur1' });
    expect(page.items[0]?.fullName).toBe('Ann Lee');
    expect(page.nextCursor).toBe('cur2');
    const [url, init] = fetchMock.mock.calls[0] as [URL | string, RequestInit];
    const target = new URL(url.toString());
    expect(target.pathname).toBe('/rest/people');
    expect(target.searchParams.get('limit')).toBe('200');
    expect(target.searchParams.get('starting_after')).toBe('cur1');
    expect(new Headers(init.headers).get('Authorization')).toBe('Bearer token-1');
  });

  it('refreshes the person’s token once when Twenty refuses it, then retries', async () => {
    const fetchMock = vi.fn().mockResolvedValueOnce(response({ message: 'expired' }, 401)).mockResolvedValueOnce(response({ data: { people: [] } }));
    const credentials = personCredentials();
    const page = await new TwentyCrmAdapter(new URL('https://crm.example.com'), credentials, fetchMock).listContacts();
    expect(page.items).toEqual([]);
    expect(credentials.mock.calls.map(([options]) => options.forceRefresh)).toEqual([false, true]);
    expect(fetchMock.mock.calls.map(authorization)).toEqual(['Bearer token-1', 'Bearer token-2']);
  });

  it('reports a connection Twenty keeps refusing as unauthorized, and a missing role permission as forbidden', async () => {
    const refused = new TwentyCrmAdapter(new URL('https://crm.example.com'), personCredentials(), vi.fn().mockResolvedValue(response({ message: 'no' }, 401)));
    await expect(refused.listContacts({ limit: 10 })).rejects.toMatchObject({ kind: 'unauthorized' });
    const denied = new TwentyCrmAdapter(new URL('https://crm.example.com'), personCredentials(), vi.fn().mockResolvedValue(response({ statusCode: 400, messages: ['Permission denied'], code: 'PERMISSION_DENIED' }, 400)));
    await expect(denied.listContacts({ limit: 10 })).rejects.toMatchObject({ kind: 'forbidden' });
  });

  it('never sends a request without the person’s token', async () => {
    const fetchMock = vi.fn();
    const adapter = new TwentyCrmAdapter(new URL('https://crm.example.com'), vi.fn().mockRejectedValue(new CrmError('unauthorized', 'not connected')), fetchMock);
    await expect(adapter.listContacts()).rejects.toMatchObject({ kind: 'unauthorized' });
    expect(fetchMock).not.toHaveBeenCalled();
  });
});
