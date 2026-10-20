import type { IconName } from '@/components/ui/icon';
import type { FocusAreaId } from '@/features/personalization/catalog';

export type NavItemId =
  | 'home' | 'inbox' | 'tasks' | 'calendar' | 'meetings'
  | 'people' | 'companies' | 'orgs' | 'relintel'
  | 'pipeline' | 'portfolio' | 'diligence' | 'invresearch'
  | 'projects' | 'energy' | 'gov' | 'bd'
  | 'documents' | 'research' | 'intelligence' | 'ai';

export type NavBottomId = 'integrations' | 'settings' | 'help';

// `focusAreas` filters emphasis in the sidebar only; it never grants or removes access (SPEC §3.2).
export type NavItem = { id: NavItemId; label: string; icon: IconName; badge?: 'inbox' | 'tasks'; focusAreas?: ReadonlyArray<FocusAreaId> };
export type NavGroup = { id: string; label: string; items: ReadonlyArray<NavItem> };

export const NAV_GROUPS: ReadonlyArray<NavGroup> = [
  {
    id: 'workspace',
    label: 'Workspace',
    items: [
      { id: 'home', label: 'Home', icon: 'home' },
      { id: 'inbox', label: 'Inbox', icon: 'inbox', badge: 'inbox' },
      { id: 'tasks', label: 'My Tasks', icon: 'tasks', badge: 'tasks' },
      { id: 'calendar', label: 'Calendar', icon: 'calendar' },
      { id: 'meetings', label: 'Meetings', icon: 'meetings' },
    ],
  },
  {
    id: 'relationships',
    label: 'Relationships',
    items: [
      { id: 'people', label: 'People', icon: 'people' },
      { id: 'companies', label: 'Companies', icon: 'company' },
      { id: 'orgs', label: 'Organizations', icon: 'org' },
      { id: 'relintel', label: 'Relationship Intelligence', icon: 'graph' },
    ],
  },
  {
    id: 'investments',
    label: 'Investments',
    items: [
      { id: 'pipeline', label: 'Deal Pipeline', icon: 'pipeline', focusAreas: ['vc', 'exec', 'finance', 'research', 'bd'] },
      { id: 'portfolio', label: 'Portfolio', icon: 'portfolio', focusAreas: ['vc', 'exec', 'finance', 'research'] },
      { id: 'diligence', label: 'Diligence', icon: 'diligence', focusAreas: ['vc', 'legal', 'finance'] },
      { id: 'invresearch', label: 'Investment Research', icon: 'flask', focusAreas: ['vc', 'research', 'exec'] },
    ],
  },
  {
    id: 'operations',
    label: 'Operations',
    items: [
      { id: 'projects', label: 'Projects', icon: 'folder' },
      { id: 'energy', label: 'Energy & Infrastructure', icon: 'bolt', focusAreas: ['energy', 'exec'] },
      { id: 'gov', label: 'Government Affairs', icon: 'capitol', focusAreas: ['ga', 'legal', 'exec'] },
      { id: 'bd', label: 'Business Development', icon: 'compass', focusAreas: ['bd', 'exec'] },
    ],
  },
  {
    id: 'knowledge',
    label: 'Knowledge & Intelligence',
    items: [
      { id: 'documents', label: 'Documents', icon: 'doc' },
      { id: 'research', label: 'Research', icon: 'book' },
      { id: 'intelligence', label: 'Intelligence', icon: 'globe' },
      { id: 'ai', label: 'RedSky AI', icon: 'ai' },
    ],
  },
];

export const NAV_BOTTOM: ReadonlyArray<{ id: NavBottomId; label: string; icon: IconName }> = [
  { id: 'integrations', label: 'Integrations', icon: 'plug' },
  { id: 'settings', label: 'Settings', icon: 'sliders' },
  { id: 'help', label: 'Help', icon: 'help' },
];

export function isNavItemForFocusAreas(item: NavItem, focusAreas: ReadonlyArray<FocusAreaId>): boolean {
  if (!item.focusAreas) return true;
  if (focusAreas.includes('exec')) return true;
  return item.focusAreas.some((area) => focusAreas.includes(area));
}

export function visibleNavGroups(focusAreas: ReadonlyArray<FocusAreaId>, showAll: boolean): { groups: Array<NavGroup & { items: NavItem[] }>; hiddenCount: number } {
  let hiddenCount = 0;
  const groups = NAV_GROUPS.map((group) => ({
    ...group,
    items: group.items.filter((item) => {
      const visible = isNavItemForFocusAreas(item, focusAreas);
      if (!visible) hiddenCount += 1;
      return visible || showAll;
    }),
  })).filter((group) => group.items.length > 0);
  return { groups, hiddenCount };
}

export const ROADMAP_PHASES = [
  { n: 'P1', name: 'Foundation', outcome: 'Connected CRM', months: 'Months 0–2' },
  { n: 'P2', name: 'Intelligence', outcome: 'Institutional intelligence', months: 'Months 2–4' },
  { n: 'P3', name: 'Operations', outcome: 'Investment & operations', months: 'Months 4–7' },
  { n: 'P4', name: 'Integration', outcome: 'Family office integration', months: 'Months 7–10' },
  { n: 'P5', name: 'Autonomous OS', outcome: 'Independent RedSky OS', months: 'Months 10–18+' },
] as const;

export type ModuleId = Exclude<NavItemId, 'home' | 'tasks' | 'people' | 'pipeline' | 'documents' | 'ai'> | 'help';

export type ModuleDefinition = { group: string; phase: 0 | 1 | 2 | 3 | 4 | 5; desc: string; caps: ReadonlyArray<string> };

// Designed placeholders for modules that are not built yet (SPEC §3.2): honest "Planned · Phase N" pages.
export const MODULES: Record<ModuleId, ModuleDefinition> = {
  inbox: { group: 'Workspace', phase: 1, desc: 'Email capture, mentions and requests routed to you. Forwarded email becomes structured relationship activity — after human review.', caps: ['Forward to redsky@rsmcapital.com', 'AI extraction of people, companies and dates', 'Review queue for unmatched records', 'Mentions and approvals in one stream'] },
  calendar: { group: 'Workspace', phase: 1, desc: 'Your Outlook calendar, enriched with the people, companies and deals behind each event.', caps: ['Two-way Outlook sync', 'Attendee profiles on every event', 'Prep status and briefs', 'Interaction logging after meetings'] },
  meetings: { group: 'Workspace', phase: 2, desc: 'Meeting notes, preparation briefs and follow-ups connected to relationships and deals.', caps: ['AI preparation briefs', 'Notes linked to records', 'Follow-up extraction with approval', 'Disclosure prompts for public officials'] },
  companies: { group: 'Relationships', phase: 1, desc: 'Company records unified across CRM, email, documents and research.', caps: ['Deduplicated company profiles', 'Linked people, deals and documents', 'Research from connected providers', 'Ownership and access controls'] },
  orgs: { group: 'Relationships', phase: 1, desc: 'Government bodies, associations, universities and other organizations RSM works with.', caps: ['Agency and committee records', 'Staff and official contacts', 'Membership and coalition tracking', 'Interaction history'] },
  relintel: { group: 'Relationships', phase: 2, desc: 'The relationship graph: who at RSM knows whom, and the strongest path to a decision-maker.', caps: ['Warm-path discovery', 'Relationship strength signals', 'Introductions and referrals', 'Coverage gaps by organization'] },
  portfolio: { group: 'Investments', phase: 3, desc: 'Portfolio monitoring with updates, KPIs and board materials in one place.', caps: ['Company updates and board materials', 'KPI tracking', 'Cap tables via Carta (planned)', 'Risk and watchlist flags'] },
  diligence: { group: 'Investments', phase: 3, desc: 'Structured diligence workflows with checklists, data rooms and findings.', caps: ['Diligence checklists', 'Reference-call tracking', 'Document review with AI summaries', 'IC memo assembly'] },
  invresearch: { group: 'Investments', phase: 2, desc: 'Investment research across internal memos and connected providers.', caps: ['Thesis libraries', 'AlphaSense and Harmonic (planned)', 'Comparable companies', 'Research briefs'] },
  projects: { group: 'Operations', phase: 3, desc: 'Internal initiatives and external projects, with milestones, owners and approvals.', caps: ['Project plans and milestones', 'Tasks and approvals', 'Status reporting for leadership', 'Links to deals, people and documents'] },
  energy: { group: 'Operations', phase: 3, desc: 'Energy and infrastructure project development — sites, permits, partners and capital.', caps: ['Site and permit tracking', 'Partner and offtaker records', 'Regulatory proceedings', 'Capital stack and milestones'] },
  gov: { group: 'Operations', phase: 3, desc: 'Government affairs: legislation, proceedings, officials and coalition work.', caps: ['Bill and proceeding tracking', 'Official-interaction logging', 'Coalition and stakeholder maps', 'LegiStorm integration (planned)'] },
  bd: { group: 'Operations', phase: 3, desc: 'Business development: partnerships, introductions and strategic opportunities.', caps: ['Partnership pipeline', 'Introduction tracking', 'Partner mapping', 'Follow-up automation with approval'] },
  research: { group: 'Knowledge & Intelligence', phase: 2, desc: "RSM's institutional knowledge — memos, notes and research — in one searchable library.", caps: ['Institutional knowledge base', 'Ask questions across sources', 'Cited answers', 'Research briefs'] },
  intelligence: { group: 'Knowledge & Intelligence', phase: 2, desc: 'A unified intelligence feed across markets, portfolio companies, energy and policy.', caps: ['Company and people alerts', 'Policy and regulatory updates', 'Why-it-matters summaries', 'Saved and shared items'] },
  help: { group: 'Support', phase: 0, desc: 'Guides, keyboard shortcuts and a direct line to the RedSky team.', caps: ['⌘K — search and commands', '⌘J — Ask RedSky', 'Esc — close panels', 'Send feedback to the RedSky team'] },
};

export function isModuleId(value: string): value is ModuleId {
  return Object.prototype.hasOwnProperty.call(MODULES, value);
}

export function navItemById(id: string): NavItem | undefined {
  for (const group of NAV_GROUPS) {
    const item = group.items.find((candidate) => candidate.id === id);
    if (item) return item;
  }
  return undefined;
}

// Workspace routes (the (workspace) route group). Modules render the designed placeholder.
export function hrefForNav(id: NavItemId | NavBottomId | ModuleId): string | null {
  if (id === 'home') return '/home';
  if (id === 'tasks') return '/home?tab=tasks';
  if (id === 'people') return '/people';
  if (id === 'pipeline') return '/pipeline';
  if (id === 'documents') return '/documents';
  if (id === 'ai' || id === 'settings' || id === 'integrations') return null;
  return `/m/${id}`;
}
