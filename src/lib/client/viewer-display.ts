'use client';

import { initialsFromName } from '@/components/ui/avatar';
import type { ViewerPayload } from '@/lib/api/contracts';
import { formatDayLabel, greetingFor, todayIn } from '@/lib/dates/due';

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

// Demo mode lives on the prototype's fixed day; production uses the current day in the firm's time zone.
export function dayContext(viewer: ViewerPayload, now = new Date()) {
  if (viewer.demo) return { todayLabel: viewer.demo.todayLabel, greeting: 'Good morning', todayIso: todayIn(viewer.config.timeZone, now) };
  return { todayLabel: formatDayLabel(viewer.config.timeZone, now), greeting: greetingFor(viewer.config.timeZone, now), todayIso: todayIn(viewer.config.timeZone, now) };
}
