import 'server-only';
import { eq, sql } from 'drizzle-orm';
import { PROFILE_PHOTO_MAX_BYTES, type ProfilePatch } from '@/features/profile/schema';
import { getDb } from '@/server/db/client';
import { employeeProfiles, users } from '@/server/db/schema';
import { badRequest } from '@/server/http/errors';
import { assertAuthorized, type Actor } from '@/server/security/access-policy';

export async function updateProfile(actor: Actor, userId: string, patch: ProfilePatch): Promise<void> {
  assertAuthorized(actor, 'write', { type: 'own', ownerId: userId });
  if (Object.keys(patch).length === 0) return;
  await getDb().update(employeeProfiles).set({ ...patch, updatedAt: sql`now()` }).where(eq(employeeProfiles.userId, userId));
  if (patch.firstName !== undefined || patch.lastName !== undefined) {
    const [row] = await getDb().select({ firstName: employeeProfiles.firstName, lastName: employeeProfiles.lastName }).from(employeeProfiles).where(eq(employeeProfiles.userId, userId)).limit(1);
    const displayName = [row?.firstName, row?.lastName].filter(Boolean).join(' ');
    if (displayName) await getDb().update(users).set({ displayName, updatedAt: sql`now()` }).where(eq(users.id, userId));
  }
}

const SIGNATURES: Array<{ mime: string; test: (bytes: Buffer) => boolean }> = [
  { mime: 'image/png', test: (b) => b.length > 8 && b.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])) },
  { mime: 'image/jpeg', test: (b) => b.length > 3 && b[0] === 0xff && b[1] === 0xd8 && b[2] === 0xff },
  { mime: 'image/gif', test: (b) => b.length > 6 && (b.subarray(0, 6).toString('ascii') === 'GIF87a' || b.subarray(0, 6).toString('ascii') === 'GIF89a') },
  { mime: 'image/webp', test: (b) => b.length > 12 && b.subarray(0, 4).toString('ascii') === 'RIFF' && b.subarray(8, 12).toString('ascii') === 'WEBP' },
];

// The file's bytes decide its type (never the client-declared MIME). SVG is rejected because it can carry script.
export function detectImageType(bytes: Buffer): string | null {
  return SIGNATURES.find((signature) => signature.test(bytes))?.mime ?? null;
}

export async function saveProfilePhoto(actor: Actor, userId: string, bytes: Buffer): Promise<void> {
  assertAuthorized(actor, 'write', { type: 'own', ownerId: userId });
  if (bytes.length === 0) throw badRequest('The file is empty');
  if (bytes.length > PROFILE_PHOTO_MAX_BYTES) throw badRequest('Photos can be up to 2 MB');
  const mime = detectImageType(bytes);
  if (!mime) throw badRequest('Upload a PNG, JPEG, WebP or GIF image');
  await getDb().update(employeeProfiles).set({ photo: bytes, photoMime: mime, updatedAt: sql`now()` }).where(eq(employeeProfiles.userId, userId));
}

export async function removeProfilePhoto(actor: Actor, userId: string): Promise<void> {
  assertAuthorized(actor, 'write', { type: 'own', ownerId: userId });
  await getDb().update(employeeProfiles).set({ photo: null, photoMime: null, updatedAt: sql`now()` }).where(eq(employeeProfiles.userId, userId));
}

export async function readProfilePhoto(actor: Actor, userId: string): Promise<{ bytes: Buffer; mime: string } | null> {
  assertAuthorized(actor, 'read', { type: 'own', ownerId: userId });
  const [row] = await getDb().select({ photo: employeeProfiles.photo, mime: employeeProfiles.photoMime }).from(employeeProfiles).where(eq(employeeProfiles.userId, userId)).limit(1);
  return row?.photo && row.mime ? { bytes: row.photo, mime: row.mime } : null;
}
