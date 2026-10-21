import { randomUUID } from 'node:crypto';
import { and, eq, inArray } from 'drizzle-orm';
import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from 'vitest';

// Connects people to the CRM through a fake Twenty authorization server, against a real, migrated RedSky database
// (REDSKY_TEST_DATABASE_URL, as in CI). Skipped without a database.
const databaseUrl = process.env.REDSKY_TEST_DATABASE_URL;
const ISSUER = 'https://crm.example.test';
if (databaseUrl) {
  Object.assign(process.env, {
    REDSKY_DATABASE_URL: databaseUrl,
    REDSKY_APP_URL: 'https://redsky.example.test',
    REDSKY_SESSION_SECRET: 's'.repeat(48),
    REDSKY_ENCRYPTION_KEY: Buffer.alloc(32, 9).toString('base64'),
    TWENTY_PUBLIC_URL: ISSUER,
    TWENTY_OAUTH_CLIENT_ID: 'redsky-client',
    TWENTY_OAUTH_CLIENT_SECRET: 'redsky-secret',
  });
}

type TokenCall = { grant: string | null; body: URLSearchParams };

function fakeTwenty() {
  const calls: TokenCall[] = [];
  const revoked: URLSearchParams[] = [];
  const apiAuthorizations: string[] = [];
  let next: Record<string, unknown> | { status: number; body: Record<string, unknown> } = {};
  const fetchMock = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = new URL(input instanceof Request ? input.url : input.toString());
    const body = new URLSearchParams(init?.body ? String(init.body) : '');
    const json = (status: number, payload: unknown) => new Response(JSON.stringify(payload), { status, headers: { 'content-type': 'application/json' } });
    if (url.href === `${ISSUER}/oauth/token`) {
      calls.push({ grant: body.get('grant_type'), body });
      if ('status' in next && typeof next.status === 'number') return json(next.status, next.body);
      return json(200, next);
    }
    if (url.href === `${ISSUER}/oauth/revoke`) {
      revoked.push(body);
      return json(200, {});
    }
    if (url.pathname === '/rest/people') {
      apiAuthorizations.push(new Headers(init?.headers).get('authorization') ?? '');
      return json(200, { data: { people: [] }, totalCount: 0, pageInfo: { hasNextPage: false, endCursor: null } });
    }
    return json(404, {});
  });
  return {
    fetchMock,
    calls,
    revoked,
    apiAuthorizations,
    respond: (value: typeof next) => {
      next = value;
    },
  };
}

describe.skipIf(!databaseUrl)('Twenty OAuth connection (database)', async () => {
  const { getDb } = await import('@/server/db/client');
  const { auditEvents, crmConnections, users } = await import('@/server/db/schema');
  const oauth = await import('@/server/integrations/crm/twenty-oauth');
  const { crmAccessFor, crmConnectionState } = await import('@/server/integrations/crm');

  const userIds: string[] = [];
  let twenty = fakeTwenty();

  const newUser = async () => {
    const [user] = await getDb()
      .insert(users)
      .values({ authProvider: 'dev', authSubject: `crm-test-${randomUUID()}`, email: 'person@example.com', displayName: 'Pat Person' })
      .returning();
    if (!user) throw new Error('user insert failed');
    userIds.push(user.id);
    return user.id;
  };

  // Simulates the browser: start, approve on Twenty's consent page, come back with the code.
  const connect = async (userId: string, overrides: Record<string, string> = {}) => {
    const { url, transactionCookie } = await oauth.beginTwentyConnect(userId, '/people');
    const callback = new URLSearchParams({ code: 'code-123', state: url.searchParams.get('state') ?? '', iss: ISSUER, ...overrides });
    return { url, transactionCookie, callback };
  };

  const storedRow = async (userId: string) => (await getDb().select().from(crmConnections).where(eq(crmConnections.userId, userId)))[0];

  beforeAll(() => {
    twenty = fakeTwenty();
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  afterAll(async () => {
    await getDb().delete(auditEvents).where(inArray(auditEvents.actorUserId, userIds));
    await getDb().delete(users).where(inArray(users.id, userIds));
    await (globalThis as unknown as { redskyDb?: { sql: { end: () => Promise<void> } } }).redskyDb?.sql.end();
  });

  const useTwenty = () => {
    twenty = fakeTwenty();
    vi.stubGlobal('fetch', twenty.fetchMock);
    return twenty;
  };

  it('sends people to Twenty’s consent page with PKCE, state and Twenty’s issuer', async () => {
    const userId = await newUser();
    const { url } = await connect(userId);
    expect(url.origin + url.pathname).toBe(`${ISSUER}/authorize`);
    expect(url.searchParams.get('client_id')).toBe('redsky-client');
    expect(url.searchParams.get('redirect_uri')).toBe('https://redsky.example.test/api/integrations/twenty/callback');
    expect(url.searchParams.get('code_challenge_method')).toBe('S256');
    expect(url.searchParams.get('code_challenge')).toBeTruthy();
    expect(url.searchParams.get('state')).toBeTruthy();
    expect(url.searchParams.get('iss')).toBe(ISSUER);
    expect(await crmConnectionState(userId)).toBe('connect_required');
    expect((await crmAccessFor(userId)).status).toBe('connect_required');
  });

  it('stores the tokens encrypted and uses them as that person', async () => {
    const fake = useTwenty();
    fake.respond({ access_token: 'access-1', token_type: 'Bearer', expires_in: 1800, refresh_token: 'refresh-1' });
    const userId = await newUser();
    const { transactionCookie, callback } = await connect(userId);

    await expect(oauth.completeTwentyConnect(callback, transactionCookie, userId)).resolves.toEqual({ returnTo: '/people' });
    const exchange = fake.calls[0]?.body;
    expect(exchange?.get('grant_type')).toBe('authorization_code');
    expect(exchange?.get('code')).toBe('code-123');
    expect(exchange?.get('code_verifier')).toBeTruthy();
    expect(exchange?.get('client_id')).toBe('redsky-client');
    expect(exchange?.get('client_secret')).toBe('redsky-secret');

    const row = await storedRow(userId);
    expect(row?.refreshTokenCiphertext).not.toContain('refresh-1');
    expect(row?.accessTokenCiphertext).not.toContain('access-1');
    expect(await crmConnectionState(userId)).toBe('connected');

    const access = await crmAccessFor(userId);
    if (access.status !== 'ok') throw new Error('expected a connected CRM');
    await access.adapter.listContacts({ limit: 1 });
    expect(fake.apiAuthorizations).toEqual(['Bearer access-1']);
    expect(fake.calls).toHaveLength(1);
  });

  it('refuses a callback with the wrong state, the wrong issuer or another person’s transaction', async () => {
    const fake = useTwenty();
    fake.respond({ access_token: 'access-x', token_type: 'Bearer', expires_in: 1800, refresh_token: 'refresh-x' });
    const userId = await newUser();
    const otherId = await newUser();

    const wrongState = await connect(userId, { state: 'forged' });
    await expect(oauth.completeTwentyConnect(wrongState.callback, wrongState.transactionCookie, userId)).rejects.toThrow();
    const wrongIssuer = await connect(userId, { iss: 'https://evil.example.test' });
    await expect(oauth.completeTwentyConnect(wrongIssuer.callback, wrongIssuer.transactionCookie, userId)).rejects.toThrow();
    const theirs = await connect(otherId);
    await expect(oauth.completeTwentyConnect(theirs.callback, theirs.transactionCookie, userId)).rejects.toThrow('different user');

    expect(fake.calls).toHaveLength(0);
    expect(await storedRow(userId)).toBeUndefined();
  });

  it('refreshes an expiring token once, even for simultaneous requests', async () => {
    const fake = useTwenty();
    fake.respond({ access_token: 'access-1', token_type: 'Bearer', expires_in: 1800, refresh_token: 'refresh-1' });
    const userId = await newUser();
    const { transactionCookie, callback } = await connect(userId);
    await oauth.completeTwentyConnect(callback, transactionCookie, userId);
    await getDb().update(crmConnections).set({ accessTokenExpiresAt: new Date(Date.now() - 1000) }).where(eq(crmConnections.userId, userId));

    fake.respond({ access_token: 'access-2', token_type: 'Bearer', expires_in: 1800, refresh_token: 'refresh-2' });
    const tokens = await Promise.all([oauth.twentyAccessToken(userId), oauth.twentyAccessToken(userId)]);
    expect(tokens).toEqual(['access-2', 'access-2']);
    const refreshes = fake.calls.filter((call) => call.grant === 'refresh_token');
    expect(refreshes).toHaveLength(1);
    expect(refreshes[0]?.body.get('refresh_token')).toBe('refresh-1');
    expect(refreshes[0]?.body.get('client_secret')).toBe('redsky-secret');

    // The rotated refresh token is the one used next time.
    await getDb().update(crmConnections).set({ accessTokenExpiresAt: new Date(Date.now() - 1000) }).where(eq(crmConnections.userId, userId));
    fake.respond({ access_token: 'access-3', token_type: 'Bearer', expires_in: 1800, refresh_token: 'refresh-3' });
    await oauth.twentyAccessToken(userId);
    expect(fake.calls.at(-1)?.body.get('refresh_token')).toBe('refresh-2');
  });

  it('asks the person to reconnect when Twenty no longer honours their grant', async () => {
    const fake = useTwenty();
    fake.respond({ access_token: 'access-1', token_type: 'Bearer', expires_in: 1800, refresh_token: 'refresh-1' });
    const userId = await newUser();
    const { transactionCookie, callback } = await connect(userId);
    await oauth.completeTwentyConnect(callback, transactionCookie, userId);
    await getDb().update(crmConnections).set({ accessTokenExpiresAt: new Date(Date.now() - 1000) }).where(eq(crmConnections.userId, userId));

    fake.respond({ status: 400, body: { error: 'invalid_grant', error_description: 'Authorization revoked' } });
    expect(await oauth.twentyAccessToken(userId)).toBeNull();
    expect(await storedRow(userId)).toBeUndefined();
    expect((await crmAccessFor(userId)).status).toBe('connect_required');
    const audit = await getDb()
      .select()
      .from(auditEvents)
      .where(and(eq(auditEvents.actorUserId, userId), eq(auditEvents.action, 'crm.connection_expired')));
    expect(audit).toHaveLength(1);
  });

  it('revokes the grant in Twenty and forgets the tokens on disconnect', async () => {
    const fake = useTwenty();
    fake.respond({ access_token: 'access-1', token_type: 'Bearer', expires_in: 1800, refresh_token: 'refresh-1' });
    const userId = await newUser();
    const { transactionCookie, callback } = await connect(userId);
    await oauth.completeTwentyConnect(callback, transactionCookie, userId);

    await oauth.disconnectTwenty(userId, 'request-1');
    expect(fake.revoked[0]?.get('token')).toBe('refresh-1');
    expect(fake.revoked[0]?.get('client_secret')).toBe('redsky-secret');
    expect(await storedRow(userId)).toBeUndefined();
    expect(await crmConnectionState(userId)).toBe('connect_required');
  });
});
