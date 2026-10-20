import type { IconName } from '@/components/ui/icon';

// Focus areas chosen in onboarding step 3. They personalize RedSky (widgets, navigation emphasis, workflows);
// they are NOT access-control roles. Access is decided by src/server/security/access-policy.ts.
export const FOCUS_AREA_IDS = ['exec', 'vc', 'energy', 'ga', 'bd', 'ops', 'finance', 'legal', 'research'] as const;
export type FocusAreaId = (typeof FOCUS_AREA_IDS)[number];

export type FocusArea = { id: FocusAreaId; name: string; desc: string; icon: IconName };

export const FOCUS_AREAS: ReadonlyArray<FocusArea> = [
  { id: 'exec', name: 'Executive Leadership', desc: 'Firm strategy, approvals and oversight across every team.', icon: 'crown' },
  { id: 'vc', name: 'Venture Capital / Investments', desc: 'Sourcing, diligence, investment committee and portfolio support.', icon: 'trend' },
  { id: 'energy', name: 'Energy & Infrastructure', desc: 'Project development, sites, partners and capital.', icon: 'bolt' },
  { id: 'ga', name: 'Government Affairs', desc: 'Policy, legislation, agencies and public officials.', icon: 'capitol' },
  { id: 'bd', name: 'Business Development', desc: 'Partnerships, introductions and strategic relationships.', icon: 'compass' },
  { id: 'ops', name: 'Operations & Administration', desc: 'Calendars, vendors, office and internal process.', icon: 'sliders' },
  { id: 'finance', name: 'Finance & Accounting', desc: 'Capital calls, reporting, budgets and controls.', icon: 'coins' },
  { id: 'legal', name: 'Legal & Compliance', desc: 'Agreements, policies, filings and conflicts.', icon: 'scale' },
  { id: 'research', name: 'Research & Strategy', desc: 'Markets, investment theses and institutional knowledge.', icon: 'flask' },
];

export const FOCUS_AREA_SHORT: Record<FocusAreaId, string> = {
  exec: 'Executive Leadership',
  vc: 'Investments',
  energy: 'Energy & Infrastructure',
  ga: 'Government Affairs',
  bd: 'Business Development',
  ops: 'Operations',
  finance: 'Finance',
  legal: 'Legal & Compliance',
  research: 'Research & Strategy',
};

export const DEPARTMENTS = [
  'Executive Leadership',
  'Venture Capital / Investments',
  'Energy & Infrastructure',
  'Government Affairs & Business Development',
  'Operations & Administration',
  'Finance & Accounting',
  'Legal & Compliance',
  'Research & Strategy',
] as const;
export type Department = (typeof DEPARTMENTS)[number];

export const DEPARTMENT_FOCUS_AREAS: Record<Department, ReadonlyArray<FocusAreaId>> = {
  'Executive Leadership': ['exec'],
  'Venture Capital / Investments': ['vc'],
  'Energy & Infrastructure': ['energy'],
  'Government Affairs & Business Development': ['ga', 'bd'],
  'Operations & Administration': ['ops'],
  'Finance & Accounting': ['finance'],
  'Legal & Compliance': ['legal'],
  'Research & Strategy': ['research'],
};

export const OFFICES = [
  { value: '', label: 'Select an office' },
  { value: 'Main office', label: 'Main office' },
  { value: 'Washington, D.C.', label: 'Washington, D.C.' },
  { value: 'Remote', label: 'Remote / field' },
] as const;

export const FOCUS_AREA_WORKFLOWS: Record<FocusAreaId, ReadonlyArray<string>> = {
  exec: ['Approval queue', 'Executive brief'],
  vc: ['Deal screening', 'Diligence checklists'],
  energy: ['Site & permitting tracking'],
  ga: ['Policy tracking', 'Official-interaction logging'],
  bd: ['Introductions & follow-ups', 'Partner mapping'],
  ops: ['Request intake'],
  finance: ['Capital call tracking'],
  legal: ['Conflict checks'],
  research: ['Research briefs'],
};

export const WIDGET_IDS = [
  'brief',
  'attention',
  'meetings',
  'relationships',
  'pipeline',
  'portfolio',
  'projects',
  'documents',
  'intel',
  'govaffairs',
  'airecs',
  'team',
  'approvals',
] as const;
export type WidgetId = (typeof WIDGET_IDS)[number];
export type RankedWidgetId = Exclude<WidgetId, 'brief'>;

export const WIDGET_SIZES = [4, 6, 8, 12] as const;
export type WidgetSize = (typeof WIDGET_SIZES)[number];

export type LayoutItem = { id: WidgetId; size: WidgetSize };

export type WidgetPreviewKind = 'brief' | 'list' | 'cards' | 'chart' | 'feed' | 'timeline';

// Widget registry (SPEC §10.2): each widget declares its identity, preview, default size and data source.
// `connector` names the integration whose absence produces the widget's not-connected state in production.
export type WidgetDefinition = {
  id: WidgetId;
  name: string;
  desc: string;
  icon: IconName;
  previewKind: WidgetPreviewKind;
  defaultSize: WidgetSize;
  connector: string | null;
};

export const WIDGETS: Record<WidgetId, WidgetDefinition> = {
  brief: { id: 'brief', name: 'Daily Brief', desc: 'An AI-synthesized summary of your day.', icon: 'sun', previewKind: 'brief', defaultSize: 12, connector: null },
  attention: { id: 'attention', name: 'Needs Your Attention', desc: 'My Tasks, follow-ups and requests, prioritized.', icon: 'tasks', previewKind: 'list', defaultSize: 8, connector: null },
  meetings: { id: 'meetings', name: "Today's Meetings", desc: 'Schedule, attendees and AI preparation.', icon: 'calendar', previewKind: 'cards', defaultSize: 4, connector: 'cal' },
  relationships: { id: 'relationships', name: 'Relationships to Reconnect', desc: 'Important people who warrant attention now.', icon: 'people', previewKind: 'cards', defaultSize: 6, connector: 'crm' },
  pipeline: { id: 'pipeline', name: 'Investment Pipeline', desc: 'Stage counts, value and movement.', icon: 'pipeline', previewKind: 'chart', defaultSize: 6, connector: 'crm' },
  portfolio: { id: 'portfolio', name: 'Portfolio Watchlist', desc: 'Updates from companies you follow.', icon: 'portfolio', previewKind: 'list', defaultSize: 6, connector: 'carta' },
  projects: { id: 'projects', name: 'Active Projects', desc: 'Initiatives, milestones and blockers.', icon: 'folder', previewKind: 'cards', defaultSize: 6, connector: 'projects' },
  documents: { id: 'documents', name: 'Recent Documents', desc: 'Files you and your team touched.', icon: 'doc', previewKind: 'list', defaultSize: 4, connector: 'sp' },
  intel: { id: 'intel', name: 'Intelligence Feed', desc: 'News & market intelligence, with why it matters.', icon: 'globe', previewKind: 'feed', defaultSize: 6, connector: 'alphasense' },
  govaffairs: { id: 'govaffairs', name: 'Government Affairs Monitor', desc: 'Legislation and proceedings you track.', icon: 'capitol', previewKind: 'timeline', defaultSize: 6, connector: 'legistorm' },
  airecs: { id: 'airecs', name: 'AI Recommendations', desc: 'Suggested next steps from RedSky AI.', icon: 'ai', previewKind: 'feed', defaultSize: 4, connector: null },
  team: { id: 'team', name: 'Team Activity', desc: 'What colleagues on your work did recently.', icon: 'activity', previewKind: 'list', defaultSize: 4, connector: 'crm' },
  approvals: { id: 'approvals', name: 'Decisions Awaiting You', desc: 'Approvals and sign-offs in your queue.', icon: 'diligence', previewKind: 'list', defaultSize: 6, connector: 'crm' },
};

// Gallery and library order.
export const WIDGET_ORDER: ReadonlyArray<WidgetId> = [
  'brief', 'attention', 'meetings', 'relationships', 'govaffairs', 'projects', 'pipeline', 'intel', 'airecs', 'approvals', 'portfolio', 'documents', 'team',
];

// Recommendation weights (SPEC §5.3; prototype ROLE_W / GOAL_W / BASE).
export const FOCUS_AREA_WIDGET_WEIGHTS: Record<FocusAreaId, ReadonlyArray<RankedWidgetId>> = {
  exec: ['approvals', 'relationships', 'pipeline', 'projects', 'intel', 'team'],
  vc: ['pipeline', 'meetings', 'attention', 'portfolio', 'documents', 'intel'],
  energy: ['projects', 'meetings', 'govaffairs', 'intel', 'documents'],
  ga: ['govaffairs', 'relationships', 'meetings', 'intel', 'projects'],
  bd: ['relationships', 'meetings', 'projects', 'pipeline', 'airecs'],
  ops: ['attention', 'projects', 'team', 'documents'],
  finance: ['portfolio', 'pipeline', 'documents', 'approvals'],
  legal: ['documents', 'attention', 'govaffairs', 'approvals'],
  research: ['intel', 'documents', 'portfolio', 'airecs'],
};

export const GOAL_IDS = ['relationships', 'meetings', 'investments', 'projects', 'portfolio', 'industry', 'tasks', 'docs', 'leadership'] as const;
export type GoalId = (typeof GOAL_IDS)[number];

export const GOAL_WIDGET_WEIGHTS: Record<GoalId, ReadonlyArray<RankedWidgetId>> = {
  relationships: ['relationships'],
  meetings: ['meetings'],
  investments: ['pipeline'],
  projects: ['projects'],
  portfolio: ['portfolio'],
  industry: ['intel'],
  tasks: ['attention'],
  docs: ['documents'],
  leadership: ['team', 'approvals'],
};

export const BASE_WIDGET_ORDER: ReadonlyArray<RankedWidgetId> = [
  'attention', 'meetings', 'relationships', 'govaffairs', 'projects', 'airecs', 'intel', 'approvals', 'pipeline', 'portfolio', 'documents', 'team',
];

export const WIDE_WIDGETS: ReadonlySet<WidgetId> = new Set<WidgetId>(['attention', 'projects', 'pipeline', 'approvals', 'intel', 'relationships']);
export const NARROW_WIDGETS: ReadonlySet<WidgetId> = new Set<WidgetId>(['meetings', 'airecs', 'team', 'documents']);

export const GOALS: ReadonlyArray<{ id: GoalId; label: string; icon: IconName }> = [
  { id: 'relationships', label: 'Staying on top of relationships', icon: 'people' },
  { id: 'meetings', label: 'Preparing for meetings', icon: 'calendar' },
  { id: 'investments', label: 'Tracking investment opportunities', icon: 'pipeline' },
  { id: 'projects', label: 'Managing projects', icon: 'folder' },
  { id: 'portfolio', label: 'Following portfolio companies', icon: 'portfolio' },
  { id: 'industry', label: 'Monitoring industry developments', icon: 'globe' },
  { id: 'tasks', label: 'Managing tasks and follow-ups', icon: 'tasks' },
  { id: 'docs', label: 'Finding documents and research', icon: 'doc' },
  { id: 'leadership', label: 'Keeping leadership informed', icon: 'crown' },
];

export const HOME_TABS = ['overview', 'tasks', 'relationships', 'projects', 'pipeline'] as const;
export type HomeTab = (typeof HOME_TABS)[number];

export const LANDING_IDS = ['brief', 'tasks', 'relationships', 'projects', 'pipeline', 'custom'] as const;
export type LandingId = (typeof LANDING_IDS)[number];

export const LANDINGS: ReadonlyArray<{ id: LandingId; label: string; desc: string; icon: IconName; tab: HomeTab }> = [
  { id: 'brief', label: 'My Daily Brief', desc: 'An AI summary of the day ahead', icon: 'sun', tab: 'overview' },
  { id: 'tasks', label: 'My Tasks', desc: 'What needs your attention', icon: 'tasks', tab: 'tasks' },
  { id: 'relationships', label: 'My Relationships', desc: 'People to reconnect with', icon: 'people', tab: 'relationships' },
  { id: 'projects', label: 'My Projects', desc: 'Initiatives and milestones', icon: 'folder', tab: 'projects' },
  { id: 'pipeline', label: 'Investment Pipeline', desc: 'Deal flow and movement', icon: 'pipeline', tab: 'pipeline' },
  { id: 'custom', label: 'Custom Dashboard', desc: 'Your own arrangement of widgets', icon: 'layout', tab: 'overview' },
];

export const HOME_TAB_WIDGET: Partial<Record<HomeTab, WidgetId>> = {
  tasks: 'attention',
  relationships: 'relationships',
  projects: 'projects',
  pipeline: 'pipeline',
};

export const DENSITY_IDS = ['focused', 'balanced', 'comprehensive'] as const;
export type Density = (typeof DENSITY_IDS)[number];

// `items` = how many items each widget shows; `widgets` = how many widgets the recommendation keeps.
export const DENSITIES: ReadonlyArray<{ id: Density; label: string; desc: string; items: number; widgets: number }> = [
  { id: 'focused', label: 'Focused', desc: 'Only what needs my attention', items: 3, widgets: 4 },
  { id: 'balanced', label: 'Balanced', desc: 'A mix of priorities and context', items: 4, widgets: 8 },
  { id: 'comprehensive', label: 'Comprehensive', desc: 'A full operational overview', items: 6, widgets: 12 },
];

export const FULL_WIDTH_TAB_ITEMS = 12;

export const AI_STYLE_IDS = ['concise', 'analytical', 'executive'] as const;
export type AiStyle = (typeof AI_STYLE_IDS)[number];

export const AI_STYLES: ReadonlyArray<{ id: AiStyle; label: string; desc: string; sample: string }> = [
  { id: 'concise', label: 'Concise', desc: 'Short, actionable responses', sample: 'Ridgeline at 9:30. Send Priya the revised term outline first — it is due today.' },
  { id: 'analytical', label: 'Analytical', desc: 'Detailed research and reasoning', sample: "Ridgeline's revised interconnection date (from the Oct 9 call) moves the LOI critical path. Three open items, in order of dependency…" },
  { id: 'executive', label: 'Executive', desc: 'High-level summaries and recommendations', sample: 'Bottom line: the partnership is on track, but the LOI depends on the interconnection date. Recommend confirming it today.' },
];

// Status reflects the RedSky roadmap. "Available in pilot" items only become live when their connector is.
export const AI_CAPABILITIES: ReadonlyArray<{ label: string; icon: IconName; live: boolean }> = [
  { label: 'Identify follow-up tasks from email', icon: 'tasks', live: true },
  { label: 'Summarize documents', icon: 'doc', live: true },
  { label: 'Prepare for meetings', icon: 'calendar', live: false },
  { label: 'Research companies and people', icon: 'search', live: false },
  { label: 'Find information across authorized systems', icon: 'graph', live: false },
  { label: 'Draft internal briefs', icon: 'edit', live: false },
  { label: "Ask about RSM's institutional knowledge", icon: 'book', live: false },
];

export const MONOGRAM_TONES = [0, 1, 2, 3, 4, 5] as const;
