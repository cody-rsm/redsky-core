import 'server-only';
import { and, eq } from 'drizzle-orm';
import * as oidc from 'openid-client';
import { sanitizeReturnTo } from '@/server/auth/entra';
import { getConfig } from '@/server/config/env';
import { getDb } from '@/server/db/client';
import { crmConnections } from '@/server/db/schema';
import { logger } from '@/server/logging/logger';
import { recordAudit } from '@/server/security/audit';
import { decryptString, deriveKey, encryptString } from '@/server/security/crypto';
import { CrmError } from './types';

// RedSky acts in Twenty as the signed-in person through Twenty's OAuth authorization server (authorization code,
// confidential client, PKCE), so Twenty's roles decide what each person sees and Twenty records them as the author
// (DECISIONS.md 2 and 16). Each person approves once; RedSky keeps their tokens encrypted and refreshes them.

export const CRM_TRANSACTION_COOKIE = 'redsky_crm_tx';
export const CRM_CALLBACK_PATH = '/api/integrations/twenty/callback';
const TRANSACTION_TTL_MS = 10 * 60 * 1000;
// Refresh slightly early so a token never expires between this check and Twenty receiving the request.
const REFRESH_MARGIN_MS = 60 * 1000;
const PROVIDER = 'twenty';

type Transaction = { state: string; codeVerifier: string; userId: string; returnTo: string; createdAt: number };

let configured: { key: string; config: oidc.Configuration } | null = null;

function oauthSettings() {
  const { crm } = getConfig();
  if (crm.access !== 'per_user' || !crm.oauth) throw new Error('Twenty OAuth is not configured');
  return crm.oauth;
}

// The endpoints are set from SERVER_URL rather than discovered: Twenty's metadata endpoint derives its issuer from
// the request's host and scheme, which differ behind Railway's proxy and would fail the issuer check.
function configuration(): oidc.Configuration {
  const { issuer, clientId, clientSecret } = oauthSettings();
  const key = `${issuer}|${clientId}`;
  if (configured?.key === key) return configured.config;
  const config = new oidc.Configuration(
    {
      issuer,
      authorization_endpoint: `${issuer}/authorize`,
      token_endpoint: `${issuer}/oauth/token`,
      revocation_endpoint: `${issuer}/oauth/revoke`,
      code_challenge_methods_supported: ['S256'],
      authorization_response_iss_parameter_supported: true,
    },
    clientId,
    undefined,
    oidc.ClientSecretPost(clientSecret),
  );
  // A local Twenty runs on plain http; production is held to https by the configuration check.
  if (!getConfig().isProduction && issuer.startsWith('http:')) oidc.allowInsecureRequests(config);
  configured = { key, config };
  return config;
}

function redirectUri(): string {
  const appUrl = getConfig().appUrl;
  if (!appUrl) throw new Error('REDSKY_APP_URL is not configured');
  return new URL(CRM_CALLBACK_PATH, appUrl).toString();
}

function transactionKey(): Buffer {
  const secret = getConfig().auth.sessionSecret;
  if (!secret) throw new Error('REDSKY_SESSION_SECRET is not configured');
  return deriveKey(secret, 'crm-oauth-transaction');
}

function tokenKey(): Buffer {
  const key = getConfig().encryptionKey;
  if (!key) throw new Error('REDSKY_ENCRYPTION_KEY is not configured');
  return key;
}

const tokenContext = (userId: string, kind: 'refresh' | 'access') => `crm:${PROVIDER}:${userId}:${kind}`;

export async function beginTwentyConnect(userId: string, returnTo: string): Promise<{ url: URL; transactionCookie: string }> {
  const config = configuration();
  const transaction: Transaction = {
    state: oidc.randomState(),
    codeVerifier: oidc.randomPKCECodeVerifier(),
    userId,
    returnTo: sanitizeReturnTo(returnTo),
    createdAt: Date.now(),
  };
  const url = oidc.buildAuthorizationUrl(config, {
    redirect_uri: redirectUri(),
    response_type: 'code',
    scope: 'api profile',
    code_challenge: await oidc.calculatePKCECodeChallenge(transaction.codeVerifier),
    code_challenge_method: 'S256',
    state: transaction.state,
    // Twenty's consent page passes this through as the issuer of the code; without it Twenty uses the host the
    // browser reached, which may not match.
    iss: oauthSettings().issuer,
  });
  return { url, transactionCookie: encryptString(JSON.stringify(transaction), transactionKey(), 'crm-oauth') };
}

export async function completeTwentyConnect(callbackQuery: URLSearchParams, transactionCookie: string | undefined, userId: string): Promise<{ returnTo: string }> {
  if (!transactionCookie) throw new Error('Missing CRM connection transaction');
  const transaction = JSON.parse(decryptString(transactionCookie, transactionKey(), 'crm-oauth')) as Transaction;
  if (Date.now() - transaction.createdAt > TRANSACTION_TTL_MS) throw new Error('CRM connection transaction expired');
  // A code obtained in someone else's browser session must never be stored against this person.
  if (transaction.userId !== userId) throw new Error('CRM connection was started by a different user');

  // Rebuilt from the configured public origin rather than trusting Host headers.
  const currentUrl = new URL(redirectUri());
  currentUrl.search = callbackQuery.toString();
  const tokens = await oidc.authorizationCodeGrant(configuration(), currentUrl, { pkceCodeVerifier: transaction.codeVerifier, expectedState: transaction.state });
  if (!tokens.refresh_token) throw new Error('Twenty returned no refresh token');
  await saveTokens(userId, tokens.access_token, tokens.refresh_token, tokens.expiresIn());
  await recordAudit({ actorUserId: userId, action: 'crm.connected', resourceType: 'crm_connection', metadata: { provider: PROVIDER } });
  return { returnTo: transaction.returnTo };
}

async function saveTokens(userId: string, accessToken: string, refreshToken: string, expiresInSeconds: number | undefined): Promise<void> {
  const key = tokenKey();
  const values = {
    refreshTokenCiphertext: encryptString(refreshToken, key, tokenContext(userId, 'refresh')),
    accessTokenCiphertext: encryptString(accessToken, key, tokenContext(userId, 'access')),
    // Twenty always sends expires_in; a missing one is treated as already expired so the next call refreshes.
    accessTokenExpiresAt: new Date(Date.now() + (expiresInSeconds ?? 0) * 1000),
    updatedAt: new Date(),
  };
  await getDb()
    .insert(crmConnections)
    .values({ userId, provider: PROVIDER, ...values })
    .onConflictDoUpdate({ target: [crmConnections.userId, crmConnections.provider], set: values });
}

async function loadConnection(userId: string) {
  const rows = await getDb()
    .select()
    .from(crmConnections)
    .where(and(eq(crmConnections.userId, userId), eq(crmConnections.provider, PROVIDER)))
    .limit(1);
  return rows[0] ?? null;
}

async function deleteConnection(userId: string): Promise<void> {
  await getDb()
    .delete(crmConnections)
    .where(and(eq(crmConnections.userId, userId), eq(crmConnections.provider, PROVIDER)));
}

export async function isTwentyConnected(userId: string): Promise<boolean> {
  return (await loadConnection(userId)) !== null;
}

const inflightRefreshes = new Map<string, Promise<string | null>>();

// The person's current access token, refreshed when close to expiry; null when they have not connected or their
// connection ended (revoked in Twenty, unused for 60 days, or removed from the workspace), so they must connect again.
export async function twentyAccessToken(userId: string): Promise<string | null> {
  const row = await loadConnection(userId);
  if (!row) return null;
  const key = tokenKey();
  if (row.accessTokenExpiresAt.getTime() - Date.now() > REFRESH_MARGIN_MS) return decryptString(row.accessTokenCiphertext, key, tokenContext(userId, 'access'));

  // Several requests from one page can arrive at once; they share one refresh.
  const pending = inflightRefreshes.get(userId);
  if (pending) return pending;
  const refresh = refreshConnection(userId, decryptString(row.refreshTokenCiphertext, key, tokenContext(userId, 'refresh'))).finally(() => inflightRefreshes.delete(userId));
  inflightRefreshes.set(userId, refresh);
  return refresh;
}

async function refreshConnection(userId: string, refreshToken: string): Promise<string | null> {
  try {
    const tokens = await oidc.refreshTokenGrant(configuration(), refreshToken);
    await saveTokens(userId, tokens.access_token, tokens.refresh_token ?? refreshToken, tokens.expiresIn());
    return tokens.access_token;
  } catch (error) {
    if (error instanceof oidc.ResponseBodyError && error.error === 'invalid_grant') {
      await deleteConnection(userId);
      await recordAudit({ actorUserId: userId, action: 'crm.connection_expired', resourceType: 'crm_connection', metadata: { provider: PROVIDER } });
      return null;
    }
    logger.warn('Twenty token refresh failed', { error: error instanceof oidc.ResponseBodyError ? error.error : error instanceof Error ? error.name : 'unknown' });
    throw new CrmError('unreachable', 'The CRM could not be reached');
  }
}

// Ends RedSky's access as this person: revokes the grant in Twenty (best effort), then forgets the tokens.
export async function disconnectTwenty(userId: string, requestId: string): Promise<void> {
  const row = await loadConnection(userId);
  if (!row) return;
  try {
    await oidc.tokenRevocation(configuration(), decryptString(row.refreshTokenCiphertext, tokenKey(), tokenContext(userId, 'refresh')), { token_type_hint: 'refresh_token' });
  } catch (error) {
    logger.warn('Twenty token revocation failed', { error: error instanceof Error ? error.name : 'unknown' });
  }
  await deleteConnection(userId);
  await recordAudit({ actorUserId: userId, action: 'crm.disconnected', resourceType: 'crm_connection', requestId, metadata: { provider: PROVIDER } });
}
