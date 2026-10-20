import type { IconName } from '@/components/ui/icon';
import type { DemoPersonaId } from '@/features/preferences/schema';

export type { DemoPersonaId };

export type Tone = 0 | 1 | 2 | 3 | 4 | 5;
export type StatusTone = 'ok' | 'wn' | 'ac' | 'n';
export type DueTone = 'ac' | 'wn' | 'tx';
export type Strength = 'Strong' | 'Warm' | 'Cooling' | 'New';
export type DemoRecordKind = 'contact' | 'deal' | 'project' | 'doc';

// '@ga' style owners refer to a demo persona; '@me' to the viewer.
export type DemoPerson = {
  name: string;
  title: string;
  org: string;
  owner?: string;
  strength?: Strength;
  tone: number;
  gov?: boolean;
  internal?: boolean;
  last?: string;
  fact?: string;
  suggest?: string;
  act?: Array<{ d: string; t: string }>;
};

export type DemoDeal = { name: string; round: string; amount: string; stage: number; lead: string; sector: string; activity: string; change: string };
export type DemoStageStat = { count: number; value: string; delta: string; dir: 'up' | 'flat' | 'down' };

export type DemoProject = {
  name: string;
  kind: string;
  status: string;
  tone: StatusTone;
  owner: string;
  ownerTone: number;
  activity: string;
  milestone: string;
  mdate: string;
  tasks: number;
  pct: number;
  pids: DemoPersonaId[];
};

export type DemoDocument = { name: string; kind: string; meta: string; pids: DemoPersonaId[] };

export type DemoMeeting = {
  time: string;
  start: number;
  dur: string;
  title: string;
  org: string;
  people: string[];
  rk: 'project' | 'deal' | null;
  rid?: string;
  related: string;
  prep: string;
  prepTone: StatusTone;
  where: string;
  gov?: boolean;
};

export type DemoPrep = {
  summary: string;
  history: Array<{ d: string; t: string; by: string }>;
  docs: string[];
  dev: string[];
  topics: string[];
  followups: Array<{ t: string; who: string; due: string; tone: DueTone }>;
};

export type DemoAttentionItem = {
  id: string;
  pids: DemoPersonaId[];
  p: 'high' | 'med' | 'low';
  type: string;
  typeIcon: IconName;
  title: string;
  related: string;
  rk: DemoRecordKind;
  rid: string;
  due: string;
  dueTone: DueTone;
  act: 'draft' | 'open' | 'prep' | 'summarize' | 'approve';
  actLabel: string;
  source: string;
  mid?: string;
  apId?: string;
};

export type DemoApproval = { id: string; title: string; by: string; due: string; dueTone: DueTone; rk: DemoRecordKind; rid: string };

export type DemoGovItem = {
  id: string;
  title: string;
  juris: string;
  position: string;
  cur: number;
  change: string;
  chipCls: '' | 'chip-ac' | 'chip-wn';
  next: string;
  rk: 'project' | null;
  rid?: string;
};

export type DemoIntelItem = { id: string; pids: DemoPersonaId[]; headline: string; source: string; date: string; topic: string; why: string; rk: DemoRecordKind; rid: string };
export type DemoPortfolioItem = { name: string; sector: string; update: string; status: string; tone: StatusTone; owner: string };

export type DemoAiRecommendation = {
  id: string;
  text: string;
  basis: string;
  actLabel: string;
  kind: 'draft' | 'propose' | 'tasks' | 'ask';
  ref?: string;
  q?: string;
  tasks?: Array<{ title: string; related: string; due: string }>;
};

export type DemoTeamActivity = { who: string; tone: number; what: string; when: string };

export type DemoNotification = {
  id: string;
  icon: IconName;
  text: string;
  time: string;
  ai?: boolean;
  go: { kind: DemoRecordKind; id: string } | { prep: string };
};

export type DemoWorkstyleProfile = {
  disc: Array<{ k: 'D' | 'I' | 'S' | 'C'; name: string; nat: number; adp: number }>;
  styleNote: string;
  forces: Array<{ m: string; a: string; b: string; pos: number }>;
  primary: string[];
  prefs: Array<{ k: string; v: string; icon: IconName }>;
};
