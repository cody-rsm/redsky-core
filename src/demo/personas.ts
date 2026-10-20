import type { AiStyle, Density, FocusAreaId, GoalId, LandingId } from '@/features/personalization/catalog';
import type { DemoPersonaId } from '@/features/preferences/schema';

// The prototype's three demo profiles (SPEC §5.4). In demo mode they select which sample dataset is shown;
// with development sign-in they are also the people you can sign in as. Never used in production data paths.
export type DemoPersona = {
  id: DemoPersonaId;
  first: string;
  last: string;
  title: string;
  department: string;
  email: string;
  tone: number;
  label: string;
  primary: boolean;
  focusAreas: FocusAreaId[];
  goals: GoalId[];
  landing: LandingId;
  density: Density;
  aiStyle: AiStyle;
  notifications: { prep: boolean; due: boolean; rel: boolean; pipe: boolean; gov: boolean };
  // The persona's own record in DEMO_PEOPLE, excluded from attendee lists ("+ you").
  selfPersonId: string | null;
  office: string;
};

export const DEMO_PERSONAS: Record<DemoPersonaId, DemoPersona> = {
  ga: {
    id: 'ga',
    first: 'Cody',
    last: '',
    title: 'Director, Government Affairs',
    department: 'Government Affairs & Business Development',
    email: 'cody@rsmcapital.com',
    tone: 1,
    label: 'Gov. Affairs & BD',
    primary: true,
    focusAreas: ['ga', 'bd'],
    goals: ['relationships', 'meetings', 'industry'],
    landing: 'brief',
    density: 'balanced',
    aiStyle: 'concise',
    notifications: { prep: true, due: true, rel: true, pipe: false, gov: true },
    selfPersonId: null,
    office: '',
  },
  vc: {
    id: 'vc',
    first: 'Marcus',
    last: 'Chen',
    title: 'Principal, Venture Investments',
    department: 'Venture Capital / Investments',
    email: 'marcus.chen@rsmcapital.com',
    tone: 4,
    label: 'Investments',
    primary: false,
    focusAreas: ['vc', 'research'],
    goals: ['investments', 'portfolio', 'docs', 'meetings'],
    landing: 'brief',
    density: 'balanced',
    aiStyle: 'analytical',
    notifications: { prep: true, due: true, rel: true, pipe: true, gov: false },
    selfPersonId: 'c13',
    office: 'Main office',
  },
  exec: {
    id: 'exec',
    first: 'Eleanor',
    last: 'Vance',
    title: 'Managing Partner',
    department: 'Executive Leadership',
    email: 'eleanor.vance@rsmcapital.com',
    tone: 0,
    label: 'Executive Leadership',
    primary: false,
    focusAreas: ['exec'],
    goals: ['leadership', 'relationships', 'investments', 'industry'],
    landing: 'brief',
    density: 'balanced',
    aiStyle: 'executive',
    notifications: { prep: true, due: true, rel: true, pipe: true, gov: true },
    selfPersonId: 'c14',
    office: 'Main office',
  },
};

export const DEMO_PERSONA_ORDER: ReadonlyArray<DemoPersonaId> = ['ga', 'vc', 'exec'];

// Demo clock: sample data is written relative to Monday, October 19 at 8:38 AM.
export const DEMO_TODAY_LABEL = 'Monday, October 19';
export const DEMO_NOW_MINUTES = 8 * 60 + 38;

export type DemoHighlight = { kicker: string; title: string; meta: string; accent?: boolean; target: { kind: 'prep'; meetingId: string } | { kind: 'contact' | 'deal' | 'project'; id: string } };

export const DEMO_HIGHLIGHTS: Record<DemoPersonaId, DemoHighlight[]> = {
  ga: [
    { kicker: 'Next up · 9:30 AM', title: 'Ridgeline × RSM — Interconnection partnership', meta: 'Brief ready · Priya Raman, Tom Becker', target: { kind: 'prep', meetingId: 'm1' } },
    { kicker: 'Most time-sensitive', title: 'Stakeholder memo — permitting reform', meta: 'Due tomorrow · markup moved to Thursday', accent: true, target: { kind: 'project', id: 'p2' } },
    { kicker: 'Reconnect', title: 'Elena Sorensen · Atlas Transmission', meta: 'Waiting 25 days for promised comments', target: { kind: 'contact', id: 'c5' } },
  ],
  exec: [
    { kicker: 'Next up · 9:30 AM', title: 'Ridgeline × RSM — Interconnection partnership', meta: 'Brief ready · with Tom Becker', target: { kind: 'prep', meetingId: 'm1' } },
    { kicker: 'Awaiting your approval', title: 'Ridgeline IC date and pre-read', meta: 'Requested by Tom Becker · due today', accent: true, target: { kind: 'deal', id: 'd2' } },
    { kicker: 'Reconnect', title: 'Raymond Hsu · Keystone Infrastructure', meta: '50 days since last contact', target: { kind: 'contact', id: 'c6' } },
  ],
  vc: [
    { kicker: 'Next up · 10:00 AM', title: 'Corvid Analytics — customer reference call', meta: 'Needs prep · with Hannah Brooks', target: { kind: 'prep', meetingId: 'm7' } },
    { kicker: 'Moving', title: 'Ridgeline Grid Storage → Investment Committee', meta: 'IC on Oct 28 · pre-read in draft', accent: true, target: { kind: 'deal', id: 'd2' } },
    { kicker: 'New in pipeline', title: 'Halcyon Robotics · Series B', meta: 'Intro today at 2:30 PM', target: { kind: 'deal', id: 'd1' } },
  ],
};

// Persona brief copy, with live counts substituted (SPEC §5.1 Daily Brief).
export function demoBriefBody(persona: DemoPersonaId, counts: { meetings: number; openItems: number; pendingApprovals: number }): string {
  const meetings = `${counts.meetings} meetings today`;
  if (persona === 'exec') {
    return `You have ${meetings} and ${counts.pendingApprovals} decisions waiting on you. Ridgeline Grid Storage advanced to Investment Committee and still needs a pre-read owner. Raymond Hsu at Keystone hasn’t heard from RSM in 50 days — your 1:00 PM is a good moment to re-engage.`;
  }
  if (persona === 'vc') {
    return `You have ${meetings}, ${counts.openItems} items that need attention, and four pipeline companies with activity this week. Corvid diligence is two reference calls behind plan, and the Halcyon Robotics intro is at 2:30 — the Series B deck arrived Oct 14.`;
  }
  return `You have ${meetings}, ${counts.openItems} items that need your attention, and 2 investment opportunities with recent activity. The permitting markup moved up to Thursday, which makes the stakeholder memo your most time-sensitive item — and Priya Raman is expecting the revised term outline before your 9:30.`;
}
