import { randomUUID } from 'node:crypto';
import { eq, inArray } from 'drizzle-orm';
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';

// The per-person Twenty connection against a real, migrated RedSky database (REDSKY_TEST_DATABASE_URL, as in CI).
// Twenty's OAuth server is replaced at the openid-client boundary, and its currentUser query at fetch.
const databaseUrl = process.env.REDSKY_TEST_DATABASE_URL;
if (databaseUrl) {
  Object.assign(process.env, {
    REDSKY_DATABASE_URL: databaseUrl,
    REDSKY_APP_URL: 'https://redsky.example.com',
    TWENTY_API_URL: 'http://twenty-server.railway.internal:3000',
    TWENTY_PUBLIC_URL: 'https://crm.example.com',
    TWENTY_OAUTH_CLIENT_ID: 'redsky-client',
    TWENTY_OAUTH_CLIENT_SECRET: 'redsky-secret',
  });
}

const oauth = vi.hoisted(() => ({
  issued: 0,
  refreshes: 0,
  revoked: [] as string[],
  refreshFails: { value: null as string | null },
  twentyEmail: { value: '' },
}));

vi.mock('openid-client', () => {
  class ResponseBodyError extends Error {
    constructor(public readonly error: string) {
      super(error);
    }
  }
  const tokens = () => {
    oauth.issued += 1;
    return { access_token: `access-${oauth.issued}`, refresh_token: `refresh-${oauth.issued}`, expires_in: 1800, token_type: 'bearer' };
  };
  return {
    ResponseBodyError,
    ClientSecretPost: () => undefined,
    allowInsecureRequests: () => undefined,
    discovery: async () => ({ fake: true }),
    randomState: () => 'state-1',
    randomPKCECodeVerifier: () => 'verifier-1',
    calculatePKCECodeChallenge: async () => 'challenge-1',
    buildAuthorizationUrl: (_config: unknown, parameters: Record<string, string>) => {
      const url = new URL('https://crm.example.com/authorize');
      for (const [key, value] of Object.entries(parameters)) url.searchParams.set(key, value);
      return url;
    },
    authorizationCodeGrant: async (_config: unknown, url: URL, checks: { pkceCodeVerifier: string; expectedState: string }) => {
      if (url.searchParams.get('state') !== checks.expectedState || checks.pkceCodeVerifier !== 'verifier-1') throw new ResponseBodyError('invalid_grant');
      return tokens();
    },
    refreshTokenGrant: async () => {
      oauth.refreshes += 1;
      await new Promise((resolve) => setTimeout(resolve, 20));
      if (oauth.refreshFails.value) throw new ResponseBodyError(oauth.refreshFails.value);
      return tokens();
    },
    tokenRevocation: async (_config: unknown, token: string) => {
      oauth.revoked.push(token);
    },
  };
});

describe.skipIf(!databaseUrl)('Twenty connection (database)', async () => {
  const { getDb } = await import('@/server/db/client');
  const { twentyConnections, users } = await import('@/server/db/schema');
  const connection = await import('@/server/integrations/crm/twenty-connection');
  const { getCrmAccess } = await import('@/server/integrations/crm');

  let user = { id: '', email: 'olivia.owner@rsmcapital.com' };
  const userIds: string[] = [];

  const callback = (state = 'state-1') => new URLSearchParams({ code: 'code-1', state, iss: 'https://crm.example.com' });
  const connect = async (as = user) => {
    const { transactionCookie } = await connection.beginConnect(as.id, '/people');
    return connection.completeConnect(as, callback(), transactionCookie);
  };
  const row = async () => (await getDb().select().from(twentyConnections).where(eq(twentyConnections.userId, user.id)))[0];

  beforeAll(async () => {
    const [created] = await getDb().insert(users).values({ authProvider: 'entra', authSubject: `twenty-test-${randomUUID()}`, email: user.email, displayName: 'Olivia Owner' }).returning();
    if (!created) throw new Error('user insert failed');
    user = { id: created.id, email: created.email };
    userIds.push(created.id);
  });

  beforeEach(async () => {
    Object.assign(oauth, { issued: 0, refreshes: 0, revoked: [] });
    oauth.refreshFails.value = null;
    oauth.twentyEmail.value = 'Olivia.Owner@rsmcapital.com';
    vi.stubGlobal(
      'fetch',
      vi.fn(async (url: URL) => {
        if (url.pathname !== '/metadata') throw new Error(`unexpected ${url}`);
        return new Response(JSON.stringify({ data: { currentUser: { id: 'twenty-user-1', email: oauth.twentyEmail.value, currentWorkspace: { id: 'workspace-1' } } } }));
      }),
    );
    await getDb().delete(twentyConnections).where(eq(twentyConnections.userId, user.id));
  });

  afterAll(async () => {
    vi.unstubAllGlobals();
    await getDb().delete(users).where(inArray(users.id, userIds));
    await (globalThis as unknown as { redskyDb?: { sql: { end: () => Promise<void> } } }).redskyDb?.sql.end();
  });

  it('sends people to Twenty’s consent page with PKCE, and keeps the verifier out of the browser', async () => {
    const { url, transactionCookie } = await connection.beginConnect(user.id, '/people');
    expect(url.origin + url.pathname).toBe('https://crm.example.com/authorize');
    expect(Object.fromEntries(url.searchParams)).toMatchObject({ redirect_uri: 'https://redsky.example.com/api/integrations/twenty/callback', scope: 'api profile', code_challenge: 'challenge-1', code_challenge_method: 'S256', state: 'state-1' });
    expect(transactionCookie).not.toContain('verifier-1');
  });

  it('stores the person’s tokens encrypted and reads Twenty with them', async () => {
    expect(await connect()).toEqual({ returnTo: '/people', account: 'Olivia.Owner@rsmcapital.com' });
    const stored = await row();
    expect(stored).toMatchObject({ status: 'active', twentyUserId: 'twenty-user-1', twentyWorkspaceId: 'workspace-1' });
    expect(`${stored?.accessTokenCiphertext}${stored?.refreshTokenCiphertext}`).not.toMatch(/access-1|refresh-1/);
    expect(await connection.connectionStatus(user.id)).toEqual({ status: 'connected', account: 'Olivia.Owner@rsmcapital.com' });
    expect(await connection.accessTokenFor(user.id, { forceRefresh: false })).toBe('access-1');
    expect((await getCrmAccess(user.id)).status).toBe('connected');
  });

  it('refuses a Twenty account that belongs to someone else, and revokes what it was given', async () => {
    oauth.twentyEmail.value = 'someone.else@rsmcapital.com';
    await expect(connect()).rejects.toMatchObject({ reason: 'mismatch', returnTo: '/people' });
    expect(oauth.revoked).toEqual(['refresh-1']);
    expect(await row()).toBeUndefined();
    expect((await getCrmAccess(user.id)).status).toBe('not_connected');
  });

  it('refuses a connection started by another RedSky user, or a changed state', async () => {
    const { transactionCookie } = await connection.beginConnect(user.id, '/people');
    await expect(connection.completeConnect({ id: randomUUID(), email: user.email }, callback(), transactionCookie)).rejects.toMatchObject({ reason: 'invalid', returnTo: null });
    await expect(connection.completeConnect(user, callback('forged-state'), transactionCookie)).rejects.toMatchObject({ reason: 'invalid' });
    await expect(connection.completeConnect(user, callback(), 'not-a-transaction')).rejects.toMatchObject({ reason: 'invalid' });
    expect(await row()).toBeUndefined();
  });

  it('refreshes an expiring token once, however many requests need it', async () => {
    await connect();
    await getDb().update(twentyConnections).set({ accessTokenExpiresAt: new Date(Date.now() + 10_000) }).where(eq(twentyConnections.userId, user.id));
    const tokens = await Promise.all([1, 2, 3].map(() => connection.accessTokenFor(user.id, { forceRefresh: false })));
    expect(tokens).toEqual(['access-2', 'access-2', 'access-2']);
    expect(oauth.refreshes).toBe(1);
    expect((await row())?.accessTokenExpiresAt.getTime()).toBeGreaterThan(Date.now() + 25 * 60_000);
    expect(await connection.accessTokenFor(user.id, { forceRefresh: false })).toBe('access-2');
  });

  it('asks the person to reconnect once Twenty refuses the grant, but not for RedSky’s own misconfiguration', async () => {
    await connect();
    oauth.refreshFails.value = 'invalid_client';
    await expect(connection.accessTokenFor(user.id, { forceRefresh: true })).rejects.toMatchObject({ kind: 'unreachable' });
    expect((await row())?.status).toBe('active');

    oauth.refreshFails.value = 'invalid_grant';
    await expect(connection.accessTokenFor(user.id, { forceRefresh: true })).rejects.toMatchObject({ kind: 'unauthorized' });
    expect(await connection.connectionStatus(user.id)).toMatchObject({ status: 'reconnect' });
    expect((await getCrmAccess(user.id)).status).toBe('reconnect');
  });

  it('asks the person to reconnect when their stored tokens no longer decrypt', async () => {
    await connect();
    await getDb().update(twentyConnections).set({ accessTokenCiphertext: 'v1.not-a-valid-envelope' }).where(eq(twentyConnections.userId, user.id));
    await expect(connection.accessTokenFor(user.id, { forceRefresh: false })).rejects.toMatchObject({ kind: 'unauthorized' });
    expect(await connection.connectionStatus(user.id)).toMatchObject({ status: 'reconnect' });
    expect(oauth.refreshes).toBe(0);
  });

  it('revokes the grant in Twenty when the person disconnects', async () => {
    await connect();
    await connection.disconnect(user.id);
    expect(oauth.revoked).toEqual(['refresh-1']);
    expect(await row()).toBeUndefined();
    expect(await connection.connectionStatus(user.id)).toEqual({ status: 'not_connected', account: null });
  });
});
