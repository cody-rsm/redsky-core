import 'server-only';
import * as oidc from 'openid-client';
import { getConfig } from '@/server/config/env';
import { decryptString, deriveKey, encryptString } from '@/server/security/crypto';
import { logger } from '@/server/logging/logger';

// Microsoft Entra ID sign-in: OIDC Authorization Code flow with PKCE, confidential client, single tenant.
// The issuer is the tenant-specific v2.0 authority, so tokens from any other tenant fail validation.

export const OIDC_TRANSACTION_COOKIE = 'redsky_oidc_tx';
const TRANSACTION_TTL_MS = 10 * 60 * 1000;
export const ENTRA_CALLBACK_PATH = '/api/auth/entra/callback';
const SCOPES = 'openid profile email User.Read';

type Transaction = { state: string; nonce: string; codeVerifier: string; returnTo: string; createdAt: number };

let discovered: { key: string; config: oidc.Configuration } | null = null;

async function entraConfiguration(): Promise<oidc.Configuration> {
  const entra = getConfig().auth.entra;
  if (!entra) throw new Error('Entra ID is not configured');
  const key = `${entra.tenantId}:${entra.clientId}`;
  if (discovered?.key === key) return discovered.config;
  const config = await oidc.discovery(
    new URL(`https://login.microsoftonline.com/${entra.tenantId}/v2.0`),
    entra.clientId,
    undefined,
    oidc.ClientSecretPost(entra.clientSecret),
    { timeout: 10 },
  );
  discovered = { key, config };
  return config;
}

function redirectUri(): string {
  const appUrl = getConfig().appUrl;
  if (!appUrl) throw new Error('REDSKY_APP_URL is not configured');
  return new URL(ENTRA_CALLBACK_PATH, appUrl).toString();
}

function transactionKey(): Buffer {
  const secret = getConfig().auth.sessionSecret;
  if (!secret) throw new Error('REDSKY_SESSION_SECRET is not configured');
  return deriveKey(secret, 'oidc-transaction');
}

// Only same-site relative paths are accepted as post-login destinations (no open redirects).
export function sanitizeReturnTo(value: string | null | undefined): string {
  if (!value || !value.startsWith('/') || value.startsWith('//') || value.startsWith('/\\') || value.startsWith('/api/')) return '/';
  return value.slice(0, 300);
}

export async function beginSignIn(returnTo: string): Promise<{ url: URL; transactionCookie: string }> {
  const config = await entraConfiguration();
  const transaction: Transaction = {
    state: oidc.randomState(),
    nonce: oidc.randomNonce(),
    codeVerifier: oidc.randomPKCECodeVerifier(),
    returnTo: sanitizeReturnTo(returnTo),
    createdAt: Date.now(),
  };
  const url = oidc.buildAuthorizationUrl(config, {
    redirect_uri: redirectUri(),
    scope: SCOPES,
    response_type: 'code',
    response_mode: 'query',
    code_challenge: await oidc.calculatePKCECodeChallenge(transaction.codeVerifier),
    code_challenge_method: 'S256',
    state: transaction.state,
    nonce: transaction.nonce,
    prompt: 'select_account',
  });
  return { url, transactionCookie: encryptString(JSON.stringify(transaction), transactionKey(), 'oidc') };
}

export type EntraIdentity = {
  oid: string;
  tenantId: string;
  email: string;
  displayName: string;
  roles: string[];
  directory: GraphProfile | null;
};

export type GraphProfile = {
  givenName: string | null;
  surname: string | null;
  jobTitle: string | null;
  department: string | null;
  mail: string | null;
  userPrincipalName: string | null;
  mobilePhone: string | null;
  businessPhones: string[];
  officeLocation: string | null;
};

export async function completeSignIn(callbackQuery: URLSearchParams, transactionCookie: string | undefined): Promise<{ identity: EntraIdentity; returnTo: string }> {
  if (!transactionCookie) throw new Error('Missing sign-in transaction');
  const transaction = JSON.parse(decryptString(transactionCookie, transactionKey(), 'oidc')) as Transaction;
  if (Date.now() - transaction.createdAt > TRANSACTION_TTL_MS) throw new Error('Sign-in transaction expired');

  const config = await entraConfiguration();
  // Rebuild the callback URL from the configured public origin rather than trusting Host headers.
  const currentUrl = new URL(redirectUri());
  currentUrl.search = callbackQuery.toString();
  const tokens = await oidc.authorizationCodeGrant(config, currentUrl, {
    pkceCodeVerifier: transaction.codeVerifier,
    expectedState: transaction.state,
    expectedNonce: transaction.nonce,
    idTokenExpected: true,
  });
  const claims = tokens.claims();
  const entra = getConfig().auth.entra;
  if (!claims || !entra) throw new Error('No ID token claims');
  const oid = typeof claims.oid === 'string' ? claims.oid : null;
  const tenantId = typeof claims.tid === 'string' ? claims.tid : null;
  if (!oid || tenantId?.toLowerCase() !== entra.tenantId.toLowerCase()) throw new Error('Token is not from the RSM tenant');

  const directory = tokens.access_token ? await fetchGraphProfile(tokens.access_token) : null;
  const email = pickString(claims.email) ?? directory?.mail ?? pickString(claims.preferred_username) ?? directory?.userPrincipalName ?? '';
  const displayName = pickString(claims.name) ?? ([directory?.givenName, directory?.surname].filter(Boolean).join(' ') || email);
  const roles = Array.isArray(claims.roles) ? claims.roles.filter((role): role is string => typeof role === 'string') : [];
  return { identity: { oid, tenantId, email, displayName, roles, directory }, returnTo: transaction.returnTo };
}

function pickString(value: unknown): string | null {
  return typeof value === 'string' && value.trim() ? value.trim() : null;
}

// Profile prefill from Microsoft Graph /me with the delegated User.Read scope. The access token is used once
// and never stored. Failure is non-fatal: onboarding simply shows the fields as not provided by the directory.
async function fetchGraphProfile(accessToken: string): Promise<GraphProfile | null> {
  try {
    const response = await fetch(
      'https://graph.microsoft.com/v1.0/me?$select=givenName,surname,jobTitle,department,mail,userPrincipalName,mobilePhone,businessPhones,officeLocation',
      { headers: { Authorization: `Bearer ${accessToken}` }, signal: AbortSignal.timeout(5000), cache: 'no-store' },
    );
    if (!response.ok) {
      logger.warn('Graph profile request failed', { status: response.status });
      return null;
    }
    const body = (await response.json()) as Record<string, unknown>;
    return {
      givenName: pickString(body.givenName),
      surname: pickString(body.surname),
      jobTitle: pickString(body.jobTitle),
      department: pickString(body.department),
      mail: pickString(body.mail),
      userPrincipalName: pickString(body.userPrincipalName),
      mobilePhone: pickString(body.mobilePhone),
      businessPhones: Array.isArray(body.businessPhones) ? body.businessPhones.filter((phone): phone is string => typeof phone === 'string') : [],
      officeLocation: pickString(body.officeLocation),
    };
  } catch (error) {
    logger.warn('Graph profile request errored', { error });
    return null;
  }
}
