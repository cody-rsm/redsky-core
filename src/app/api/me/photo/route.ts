import { NextResponse } from 'next/server';
import { PROFILE_PHOTO_MAX_BYTES } from '@/features/profile/schema';
import { authedRoute } from '@/server/http/api';
import { badRequest, notFound } from '@/server/http/errors';
import { readProfilePhoto, removeProfilePhoto, saveProfilePhoto } from '@/server/services/profile-service';

export const GET = authedRoute(async ({ user, actor }) => {
  const photo = await readProfilePhoto(actor, user.id);
  if (!photo) throw notFound('No photo');
  return new NextResponse(new Uint8Array(photo.bytes), {
    headers: { 'Content-Type': photo.mime, 'Cache-Control': 'private, max-age=300', 'X-Content-Type-Options': 'nosniff', 'Content-Security-Policy': "default-src 'none'" },
  });
});

export const POST = authedRoute(
  async ({ request, user, actor }) => {
    const form = await request.formData();
    const file = form.get('photo');
    if (!(file instanceof File)) throw badRequest('Choose an image to upload');
    if (file.size > PROFILE_PHOTO_MAX_BYTES) throw badRequest('Photos can be up to 2 MB');
    await saveProfilePhoto(actor, user.id, Buffer.from(await file.arrayBuffer()));
    return { ok: true };
  },
  { rateLimit: { name: 'photo', capacity: 10, perMinute: 5 } },
);

export const DELETE = authedRoute(async ({ user, actor }) => {
  await removeProfilePhoto(actor, user.id);
  return { ok: true };
});
