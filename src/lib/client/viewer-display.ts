'use client';

import { initialsFromName } from '@/components/ui/avatar';
import type { ViewerPayload } from '@/lib/api/contracts';

export function viewerDisplay(viewer: ViewerPayload) {
  const { profile } = viewer;
  const fullName = [profile.firstName, profile.lastName].filter(Boolean).join(' ') || viewer.user.displayName || 'New user';
  const initials = `${profile.firstName.trim().charAt(0)}${profile.lastName.trim().charAt(0)}`.toUpperCase() || initialsFromName(fullName) || 'RS';
  return {
    fullName,
    initials,
    // SPEC §4 step 2: the preferred name is used in greetings and the Daily Brief.
    greetingName: profile.preferredName || profile.firstName || 'there',
    photoUrl: profile.photoVersion ? `/api/me/photo?v=${profile.photoVersion}` : null,
    tone: profile.monogramTone,
    title: profile.title,
  };
}
