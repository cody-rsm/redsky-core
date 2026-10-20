import 'server-only';
import { eq } from 'drizzle-orm';
import * as oidc from 'openid-client';
import type { CrmConnectionView } from '@/lib/api/contracts';
import { sanitizeReturnTo } from '@/server/auth/entra';
import { getConfig } from '@/server/config/env';
import { getDb } from '@/server/db/client';
import { twentyConnections } from '@/server/db/schema';
import { logger } from '@/server/logging/logger';
import { decryptString, deriveKey, encryptString } from '@/server/security/crypto';
import { CrmError } from './types';

// Each person connects RedSky to Twenty once, through Twenty's own OAuth server (authorization code with PKCE,
// confidential client). RedSky then calls Twenty with that person's token, so Twenty applies their role and
// deal walls (docs/DECISIONS.md 2 and 7). Tokens are encrypted at rest and refreshed here, on the server.

export const TWENTY_TRANSACTION_COOKIE = 'redsky_twenty_tx';
export const TWENTY_COOKIE_PATH = '/api/integrations/twenty';
export const TWENTY_CALLBACK_PATH = '/api/integrations/twenty/callback';
const TRANSACTION_TTL_MS = 10 * 60 * 1000;
const SCOPES = 'api profile';
// Refresh a minute early, so a token never expires between this check and Twenty's.
const EXPIRY_MARGIN_MS = 60_000;
const TIMEOUT_MS = 10_000;

type Transaction = { state: string; codeVerifier: string; userId: string; returnTo: string; createdAt: number };
type Settings = { baseUrl: URL; publicUrl: URL; clientId: string; clientSecret: string; appUrl: URL; key: Buffer; allowHttp: boolean };

export class TwentyConnectionError extends Error {
  constructor(
    public readonly reason: 'not_configured' | 'denied' | 'mismatch' | 'invalid' | 'unreachable',
    message: string,
    // The page the person started from, once their own transaction has been read.
    public readonly returnTo: string | null = null,
  ) {
    super(message);
  }
}

function settings(): Settings {
  const config = getConfig();
  const { crm } = config;
  if (crm.provider !== 'twenty' || !crm.baseUrl || !crm.publicUrl || !crm.oauth || !config.appUrl || !config.encryptionKey) {
    throw new TwentyConnectionError('not_configured', 'The Twenty connection is not configured');
  }
  return {
    baseUrl: crm.baseUrl,
    publicUrl: crm.publicUrl,
    clientId: crm.oauth.clientId,
    clientSecret: crm.oauth.clientSecret,
    appUrl: config.appUrl,
    key: config.encryptionKey,
    allowHttp: !config.isProduction,
  };
}

let discovered: { key: string; config: oidc.Configuration } | null = null;

async function oauthConfiguration(): Promise<oidc.Configuration> {
  const { publicUrl, clientId, clientSecret, allowHttp } = settings();
  const key = `${publicUrl.href}:${clientId}`;
  if (discovered?.key === key) return discovered.config;
  try {
    // Twenty publishes RFC 8414 metadata; its issuer is the public address people's browsers use.
    const config = await oidc.discovery(publicUrl, clientId, undefined, oidc.ClientSecretPost(clientSecret), {
      algorithm: 'oauth2',
      timeout: TIMEOUT_MS / 1000,
      ...(allowHttp && publicUrl.protocol === 'http:' ? { execute: [oidc.allowInsecureRequests] } : {}),
    });
    discovered = { key, config };
    return config;
  } catch (error) {
    logger.warn('Twenty OAuth discovery failed', { error: errorName(error) });
    throw new TwentyConnectionError('unreachable', 'Twenty could not be reached');
  }
}

const tokenContext = (userId: string, kind: 'access' | 'refresh') => `twenty:${userId}:${kind}`;
const transactionKey = (key: Buffer) => deriveKey(key.toString('base64'), 'twenty-oauth-transaction');

function callbackUrl(appUrl: URL): URL {
  return new URL(TWENTY_CALLBACK_PATH, appUrl);
}

export async function beginConnect(userId: string, returnTo: string | null): Promise<{ url: URL; transactionCookie: string }> {
  const { appUrl, key } = settings();
  const config = await oauthConfiguration();
  const transaction: Transaction = {
    state: oidc.randomState(),
    codeVerifier: oidc.randomPKCECodeVerifier(),
    userId,
    returnTo: sanitizeReturnTo(returnTo),
    createdAt: Date.now(),
  };
  const url = oidc.buildAuthorizationUrl(config, {
    redirect_uri: callbackUrl(appUrl).toString(),
    scope: SCOPES,
    response_type: 'code',
    code_challenge: await oidc.calculatePKCECodeChallenge(transaction.codeVerifier),
    code_challenge_method: 'S256',
    state: transaction.state,
  });
  return { url, transactionCookie: encryptString(JSON.stringify(transaction), transactionKey(key), 'twenty-oauth') };
}

type TwentyIdentity = { userId: string; email: string; workspaceId: string };

// The Twenty account behind a token. `currentUser` answers for the user an OAuth token was granted by.
async function fetchIdentity(baseUrl: URL, accessToken: string): Promise<TwentyIdentity> {
  let body: { data?: { currentUser?: { id?: string; email?: string; currentWorkspace?: { id?: string } | null } }; errors?: unknown[] } | null = null;
  try {
    const response = await fetch(new URL('/metadata', baseUrl), {
      method: 'POST',
      headers: { Authorization: `Bearer ${accessToken}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ query: 'query { currentUser { id email currentWorkspace { id } } }' }),
      signal: AbortSignal.timeout(TIMEOUT_MS),
      cache: 'no-store',
    });
    body = await response.json();
  } catch (error) {
    logger.warn('Reading the Twenty account failed', { error: errorName(error) });
    throw new TwentyConnectionError('unreachable', 'Twenty could not be reached');
  }
  const user = body?.data?.currentUser;
  if (!user?.id || !user.email || !user.currentWorkspace?.id) throw new TwentyConnectionError('invalid', 'Twenty did not say whose token this is');
  return { userId: user.id, email: user.email, workspaceId: user.currentWorkspace.id };
}

const sameEmail = (first: string, second: string) => first.trim().toLowerCase() === second.trim().toLowerCase();

// Finishes the connection for the signed-in RedSky user. The Twenty account must be the same person (same email):
// otherwise RedSky would act in Twenty, and record audit events there, under someone else's name.
export async function completeConnect(user: { id: string; email: string }, callbackQuery: URLSearchParams, transactionCookie: string | undefined): Promise<{ returnTo: string; account: string }> {
  const { appUrl, baseUrl, key } = settings();
  if (!transactionCookie) throw new TwentyConnectionError('invalid', 'Missing connection transaction');
  let transaction: Transaction;
  try {
    transaction = JSON.parse(decryptString(transactionCookie, transactionKey(key), 'twenty-oauth')) as Transaction;
  } catch {
    throw new TwentyConnectionError('invalid', 'Unreadable connection transaction');
  }
  if (Date.now() - transaction.createdAt > TRANSACTION_TTL_MS) throw new TwentyConnectionError('invalid', 'Connection transaction expired');
  if (transaction.userId !== user.id) throw new TwentyConnectionError('invalid', 'Connection started by another RedSky user');
  try {
    return await exchangeAndStore(user, transaction, callbackQuery, { appUrl, baseUrl, key });
  } catch (error) {
    if (error instanceof TwentyConnectionError) throw new TwentyConnectionError(error.reason, error.message, transaction.returnTo);
    throw error;
  }
}

async function exchangeAndStore(
  user: { id: string; email: string },
  transaction: Transaction,
  callbackQuery: URLSearchParams,
  { appUrl, baseUrl, key }: Pick<Settings, 'appUrl' | 'baseUrl' | 'key'>,
): Promise<{ returnTo: string; account: string }> {
  if (callbackQuery.get('error')) throw new TwentyConnectionError('denied', 'Twenty did not grant access');

  const config = await oauthConfiguration();
  // Rebuilt from the configured origin rather than trusting Host headers.
  const currentUrl = callbackUrl(appUrl);
  currentUrl.search = callbackQuery.toString();
  let tokens: oidc.TokenEndpointResponse;
  try {
    tokens = await oidc.authorizationCodeGrant(config, currentUrl, { pkceCodeVerifier: transaction.codeVerifier, expectedState: transaction.state });
  } catch (error) {
    logger.warn('Twenty authorization code exchange failed', { error: errorName(error) });
    throw new TwentyConnectionError('invalid', 'Twenty refused the authorization code');
  }
  if (!tokens.refresh_token) throw new TwentyConnectionError('invalid', 'Twenty returned no refresh token');

  const identity = await fetchIdentity(baseUrl, tokens.access_token);
  if (!sameEmail(identity.email, user.email)) {
    await revoke(config, tokens.refresh_token);
    throw new TwentyConnectionError('mismatch', 'The Twenty account belongs to someone else');
  }

  const values = {
    twentyUserId: identity.userId,
    twentyWorkspaceId: identity.workspaceId,
    account: identity.email,
    ...encryptedAccess(user.id, key, tokens),
    refreshTokenCiphertext: encryptString(tokens.refresh_token, key, tokenContext(user.id, 'refresh')),
    status: 'active' as const,
    connectedAt: new Date(),
    updatedAt: new Date(),
  };
  await getDb().insert(twentyConnections).values({ userId: user.id, ...values }).onConflictDoUpdate({ target: twentyConnections.userId, set: values });
  return { returnTo: transaction.returnTo, account: identity.email };
}

function encryptedAccess(userId: string, key: Buffer, tokens: oidc.TokenEndpointResponse) {
  const lifetimeSeconds = typeof tokens.expires_in === 'number' && tokens.expires_in > 0 ? tokens.expires_in : 300;
  return {
    accessTokenCiphertext: encryptString(tokens.access_token, key, tokenContext(userId, 'access')),
    accessTokenExpiresAt: new Date(Date.now() + lifetimeSeconds * 1000),
  };
}

async function loadConnection(userId: string) {
  const [row] = await getDb().select().from(twentyConnections).where(eq(twentyConnections.userId, userId)).limit(1);
  return row ?? null;
}

export async function connectionStatus(userId: string): Promise<CrmConnectionView> {
  if (getConfig().crm.provider !== 'twenty') return { status: 'not_configured', account: null };
  const row = await loadConnection(userId);
  if (!row) return { status: 'not_connected', account: null };
  return { status: row.status === 'active' ? 'connected' : 'reconnect', account: row.account };
}

export async function hasActiveConnection(userId: string): Promise<boolean> {
  return (await connectionStatus(userId)).status === 'connected';
}

const refreshing = new Map<string, Promise<string>>();

// The person's current access token, refreshed when it is about to expire or when Twenty just refused it.
// Throws CrmError('unauthorized') once Twenty no longer accepts the connection; the person then reconnects.
export async function accessTokenFor(userId: string, options: { forceRefresh: boolean }): Promise<string> {
  const { key } = settings();
  const row = await loadConnection(userId);
  if (!row || row.status !== 'active') throw new CrmError('unauthorized', 'Connect your Twenty account to see CRM records');
  if (!options.forceRefresh && row.accessTokenExpiresAt.getTime() - EXPIRY_MARGIN_MS > Date.now()) {
    return storedToken(userId, row.accessTokenCiphertext, key, 'access');
  }
  // One refresh per person at a time; concurrent requests wait for it.
  const inFlight = refreshing.get(userId);
  if (inFlight) return inFlight;
  const refresh = storedToken(userId, row.refreshTokenCiphertext, key, 'refresh')
    .then((refreshToken) => refreshTokens(userId, refreshToken, key))
    .finally(() => refreshing.delete(userId));
  refreshing.set(userId, refresh);
  return refresh;
}

// A token that no longer decrypts (REDSKY_ENCRYPTION_KEY was replaced) can't be used or refreshed: the person reconnects.
async function storedToken(userId: string, ciphertext: string, key: Buffer, kind: 'access' | 'refresh'): Promise<string> {
  try {
    return decryptString(ciphertext, key, tokenContext(userId, kind));
  } catch {
    await markReconnect(userId);
    throw new CrmError('unauthorized', 'Reconnect your Twenty account to see CRM records.');
  }
}

async function refreshTokens(userId: string, refreshToken: string, key: Buffer): Promise<string> {
  const config = await oauthConfiguration().catch(() => {
    throw new CrmError('unreachable', 'Twenty could not be reached');
  });
  let tokens: oidc.TokenEndpointResponse;
  try {
    tokens = await oidc.refreshTokenGrant(config, refreshToken);
  } catch (error) {
    if (error instanceof oidc.ResponseBodyError && error.error === 'invalid_grant') {
      await markReconnect(userId);
      throw new CrmError('unauthorized', 'Twenty no longer accepts your connection. Reconnect your Twenty account.');
    }
    // invalid_client means RedSky's own client id or secret is wrong: a configuration problem, not this person's.
    logger.warn('Refreshing a Twenty token failed', { error: errorName(error) });
    throw new CrmError('unreachable', 'Twenty could not be reached');
  }
  await getDb()
    .update(twentyConnections)
    .set({
      ...encryptedAccess(userId, key, tokens),
      // Twenty issues a new refresh token on each refresh, which extends the connection's lifetime.
      ...(tokens.refresh_token ? { refreshTokenCiphertext: encryptString(tokens.refresh_token, key, tokenContext(userId, 'refresh')) } : {}),
      updatedAt: new Date(),
    })
    .where(eq(twentyConnections.userId, userId));
  return tokens.access_token;
}

export async function markReconnect(userId: string): Promise<void> {
  await getDb().update(twentyConnections).set({ status: 'reconnect', updatedAt: new Date() }).where(eq(twentyConnections.userId, userId));
}

// Revokes the grant in Twenty (which invalidates every refresh token issued under it) and forgets the tokens.
// Access tokens already issued stay valid in Twenty until they expire (at most 30 minutes by default).
export async function disconnect(userId: string): Promise<void> {
  const row = await loadConnection(userId);
  if (!row) return;
  try {
    const { key } = settings();
    await revoke(await oauthConfiguration(), decryptString(row.refreshTokenCiphertext, key, tokenContext(userId, 'refresh')));
  } catch (error) {
    logger.warn('Revoking a Twenty connection failed; removing it from RedSky anyway', { error: errorName(error) });
  }
  await getDb().delete(twentyConnections).where(eq(twentyConnections.userId, userId));
}

async function revoke(config: oidc.Configuration, refreshToken: string): Promise<void> {
  try {
    await oidc.tokenRevocation(config, refreshToken, { token_type_hint: 'refresh_token' });
  } catch (error) {
    logger.warn('Twenty token revocation failed', { error: errorName(error) });
  }
}

function errorName(error: unknown): string {
  if (error instanceof oidc.ResponseBodyError) return `${error.name}:${error.error}`;
  return error instanceof Error ? error.name : 'unknown';
}
