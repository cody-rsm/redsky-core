import { LANDINGS, type LandingId } from '@/features/personalization/catalog';

// "Opens to" preference (SPEC §5): which Home tab RedSky opens on.
export function landingTab(landing: LandingId) {
  return LANDINGS.find((entry) => entry.id === landing)?.tab ?? 'overview';
}

export function landingHref(landing: LandingId): string {
  const tab = landingTab(landing);
  return tab === 'overview' ? '/home' : `/home?tab=${tab}`;
}
