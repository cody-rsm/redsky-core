import 'server-only';
import { and, eq, gt, isNull, lt } from 'drizzle-orm';
import { cookies } from 'next/headers';
import { cache } from 'react';
import { getConfig } from '@/server/config/env';
import { getDb } from '@/server/db/client';
import { sessions, users } from '@/server/db/schema';
import { randomToken, sha256 } from '@/server/security/crypto';
import type { Actor } from '@/server/security/access-policy';

export type SessionUser = {
  id: string;
  email: string;
  displayName: string;
  accessRole: 'member' | 'admin';
  authProvider: 'entra' | 'dev';
  authSubject: string;
};

const LAST_SEEN_THROTTLE_MS = 5 * 60 * 1000;

// `__Host-` binds the cookie to this exact origin over HTTPS (no Domain, Path=/). Plain HTTP local development
// cannot use the prefix.
export function sessionCookieName(): string {
  return getConfig().isProduction ? '__Host-redsky_session' : 'redsky_session';
}

export async function createSession(userId: string): Promise<{ token: string; expiresAt: Date }> {
  const config = getConfig();
  const token = randomToken(32);
  const expiresAt = new Date(Date.now() + config.auth.sessionTtlHours * 3600 * 1000);
  await getDb().insert(sessions).values({ tokenHash: sha256(token), userId, expiresAt });
  // Opportunistic cleanup keeps the table small without a scheduler.
  await getDb().delete(sessions).where(lt(sessions.expiresAt, new Date(Date.now() - 24 * 3600 * 1000)));
  return { token, expiresAt };
}

export async function setSessionCookie(token: string, expiresAt: Date): Promise<void> {
  const store = await cookies();
  store.set(sessionCookieName(), token, {
    httpOnly: true,
    secure: getConfig().isProduction,
    sameSite: 'lax',
    path: '/',
    expires: expiresAt,
  });
}

export async function clearSessionCookie(): Promise<void> {
  const store = await cookies();
  store.delete(sessionCookieName());
}

async function lookupSession(token: string): Promise<SessionUser | null> {
  const config = getConfig();
  const tokenHash = sha256(token);
  const rows = await getDb()
    .select({
      id: users.id,
      email: users.email,
      displayName: users.displayName,
      accessRole: users.accessRole,
      authProvider: users.authProvider,
      authSubject: users.authSubject,
      status: users.status,
      lastSeenAt: sessions.lastSeenAt,
    })
    .from(sessions)
    .innerJoin(users, eq(users.id, sessions.userId))
    .where(and(eq(sessions.tokenHash, tokenHash), isNull(sessions.revokedAt), gt(sessions.expiresAt, new Date())))
    .limit(1);
  const row = rows[0];
  if (!row || row.status !== 'active') return null;
  // Defense in depth: sessions minted by development sign-in are never honored by a production build, and
  // sessions only count while the sign-in method that created them is the configured one.
  if (row.authProvider === 'dev' && (config.isProduction || config.auth.mode !== 'dev')) return null;
  if (row.authProvider === 'entra' && config.auth.mode !== 'entra') return null;
  if (Date.now() - row.lastSeenAt.getTime() > LAST_SEEN_THROTTLE_MS) {
    await getDb().update(sessions).set({ lastSeenAt: new Date() }).where(eq(sessions.tokenHash, tokenHash));
  }
  return { id: row.id, email: row.email, displayName: row.displayName, accessRole: row.accessRole, authProvider: row.authProvider, authSubject: row.authSubject };
}

// Server-side session validation; cached per request so layouts, pages and handlers share one lookup.
export const getSessionUser = cache(async (): Promise<SessionUser | null> => {
  if (getConfig().auth.mode === 'none' || !getConfig().databaseUrl) return null;
  const store = await cookies();
  const token = store.get(sessionCookieName())?.value;
  if (!token || token.length > 200) return null;
  return lookupSession(token);
});

export async function revokeCurrentSession(): Promise<void> {
  const store = await cookies();
  const token = store.get(sessionCookieName())?.value;
  if (token) await getDb().update(sessions).set({ revokedAt: new Date() }).where(eq(sessions.tokenHash, sha256(token)));
}

export function actorFor(user: SessionUser): Actor {
  return { userId: user.id, accessRole: user.accessRole, teamIds: [] };
}
