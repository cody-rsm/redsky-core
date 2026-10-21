// Shapes exchanged between RedSky's API and its client. They are RedSky's normalized domain view models — never
// raw Twenty, Microsoft Graph or demo-fixture shapes — so data sources can change without touching components.
import type { IconName } from '@/components/ui/icon';
import type { AiAnswer, AiProviderKind, RecordKind, SourceRef } from '@/features/ai/types';
import type { DocumentStatus, DocumentVisibility } from '@/features/documents/catalog';
import type { ConnectorId } from '@/features/integrations/catalog';
import type { FocusAreaId } from '@/features/personalization/catalog';
import type { DashboardLayout, DemoPersonaId, WorkspacePreferences } from '@/features/preferences/schema';
import type { WsRecommendationId } from '@/features/workstyle/catalog';
import type { WsRecommendationStates } from '@/features/workstyle/apply';
import type { WorkstyleProfile, WorkstyleProfileDraft } from '@/features/workstyle/profile';

export type DataMode = 'demo' | 'production';

export type PublicConfigView = {
  dataMode: DataMode;
  authMode: 'entra' | 'dev' | 'none';
  aiAvailable: boolean;
  aiSimulated: boolean;
  crmConnected: boolean;
  crmAccess: 'per_user' | 'shared_key' | 'none';
  workstyleStorageAvailable: boolean;
  documentsAvailable: boolean;
  // The firm's time zone; dates and greetings use it so server and browser render the same text.
  timeZone: string;
};

export type DirectoryField = 'firstName' | 'lastName' | 'title' | 'department' | 'email' | 'phone' | 'office';

export type ProfileView = {
  firstName: string;
  lastName: string;
  preferredName: string;
  title: string;
  department: string;
  email: string;
  phone: string;
  office: string;
  bio: string;
  monogramTone: number;
  photoVersion: string | null;
  focusAreas: FocusAreaId[];
  directorySource: Partial<Record<DirectoryField, 'entra' | 'missing'>>;
};

export type DemoPersonaView = { id: DemoPersonaId; name: string; initials: string; tone: number; label: string; title: string; primary: boolean };

export type ViewerPayload = {
  user: { id: string; displayName: string; email: string; accessRole: 'member' | 'admin'; authProvider: 'entra' | 'dev' };
  profile: ProfileView;
  preferences: WorkspacePreferences;
  layout: DashboardLayout;
  onboarding: { currentStep: number; maxStep: number; completed: boolean };
  integrations: Partial<Record<ConnectorId, 'notify' | 'requested'>>;
  workstyle: WorkstyleSummary;
  config: PublicConfigView;
  // This person's CRM connection: with per-user access, each person connects once before RedSky can read the CRM as them.
  crm: CrmConnectionState;
  demo: { activePersona: DemoPersonaId; personas: DemoPersonaView[]; switchesUser: boolean; todayLabel: string } | null;
};

// ---- Widgets ---------------------------------------------------------------------------------------------

export type NotConnectedSource = { connectorId: ConnectorId | 'crm' | 'projects' | 'approvals'; title: string; body: string; mono: string; tone: number; logo?: string };

export type WidgetResponse<TData> =
  | { status: 'ok'; sample: boolean; data: TData }
  | { status: 'not_connected'; source: NotConnectedSource };

export type DueView = { kind: 'date'; on: string } | { kind: 'label'; label: string; tone: 'ac' | 'wn' | 'tx'; rank: number };

export type AttentionAction = 'draft' | 'open' | 'prep' | 'summarize' | 'approve';

// How an item or suggestion asks RedSky AI; decided server-side so the client holds no data-source logic.
export type AiAsk = { question: string; key: string; ref: string | null };
export type ConfirmCopy = { title: string; body: string; items: string[]; ok: string };

export type AttentionItemView = {
  key: string; // "task:<uuid>" for RedSky tasks, "demo:<id>" for sample items
  title: string;
  priority: 'high' | 'med' | 'low';
  type: string;
  typeIcon: IconName;
  related: { label: string; record: { kind: RecordKind; id: string } | null };
  due: DueView;
  action: AttentionAction;
  actionLabel: string;
  sourceNote: string;
  meetingId: string | null;
  approval: { id: string; title: string; requestedBy: string } | null;
  ask: AiAsk | null;
  done: boolean;
};

export type PersonChip = { name: string; initials: string; tone: number };

export type MeetingView = {
  id: string;
  time: string;
  startMinutes: number;
  duration: string;
  title: string;
  org: string;
  attendees: PersonChip[];
  includesViewer: boolean;
  related: { kind: RecordKind; id: string; label: string } | null;
  prepLabel: string;
  prepTone: 'ok' | 'wn' | 'ac' | 'n';
  where: string;
};

export type MeetingsData = { meetings: MeetingView[]; nowMinutes: number | null };

export type ReconnectView = {
  id: string;
  name: string;
  initials: string;
  tone: number;
  title: string;
  org: string;
  strength: 'Strong' | 'Warm' | 'Cooling' | 'New' | null;
  lastInteraction: string;
  owner: string;
  recordedFact: string;
  suggestion: string;
};

export type PipelineData = {
  totalLabel: string;
  stages: Array<{ name: string; count: number; value: string; delta: string; dir: 'up' | 'flat' | 'down'; pct: number; neutral: boolean }>;
  moves: Array<{ id: string; name: string; round: string; stage: string; change: string; lead: PersonChip & { name: string }; amount: string }>;
};

export type ProjectView = {
  id: string;
  name: string;
  kind: string;
  status: string;
  tone: 'ok' | 'wn' | 'ac' | 'n';
  pct: number;
  activity: string;
  milestone: string;
  milestoneDate: string;
  owner: PersonChip;
  openTasks: number;
};

export type IntelView = { id: string; topic: string; source: string; date: string; headline: string; why: string; saved: boolean; related: { kind: RecordKind; id: string } | null };

export type GovView = {
  id: string;
  title: string;
  jurisdiction: string;
  position: string;
  change: string;
  changeTone: 'accent' | 'warn' | 'neutral';
  steps: Array<{ label: string; state: 'done' | 'cur' | 'todo' }>;
  next: string;
  related: { kind: RecordKind; id: string } | null;
};

// draft/ask open RedSky AI with `ask`; tasks/propose change data, so they go through the confirmation dialog
// with `confirm` and execute server-side via /api/actions/confirm.
export type AiRecommendationView = { id: string; text: string; basis: string; actionLabel: string; kind: 'draft' | 'propose' | 'tasks' | 'ask'; ask: AiAsk | null; confirm: ConfirmCopy | null };

export type ApprovalView = { id: string; title: string; requestedBy: string; due: string; dueTone: 'ac' | 'wn' | 'tx'; approved: boolean; record: { kind: RecordKind; id: string } };

export type PortfolioView = { name: string; sector: string; update: string; status: string; tone: 'ok' | 'wn' | 'ac' | 'n'; owner: string };
// `href` is set for RedSky's own documents, which open on the Documents page instead of a record preview.
export type DocumentView = { id: string; name: string; meta: string; kind: string; href?: string };
export type TeamActivityView = PersonChip & { what: string; when: string };

export type BriefStatTarget = { kind: 'prep'; meetingId: string } | { kind: 'tab'; tab: 'tasks' } | { kind: 'nav'; href: string } | { kind: 'ask'; question: string; key: string } | { kind: 'settings'; tab: 'apps' };

export type BriefData = {
  body: string;
  // True when the paragraph is AI-synthesized (labelled "Synthesized by RedSky AI"); false for plain summaries.
  synthesized: boolean;
  provenance: string;
  stats: Array<{ key: 'meetings' | 'tasks' | 'opps' | 'followups'; value: string; label: string; target: BriefStatTarget }>;
  highlights: Array<{ kicker: string; title: string; meta: string; accent: boolean; target: { kind: 'prep'; meetingId: string } | { kind: RecordKind; id: string } }>;
};

export type WidgetDataMap = {
  brief: BriefData;
  attention: { items: AttentionItemView[] };
  meetings: MeetingsData;
  relationships: { people: ReconnectView[] };
  pipeline: PipelineData;
  projects: { projects: ProjectView[] };
  intel: { items: IntelView[] };
  govaffairs: { items: GovView[] };
  airecs: { items: AiRecommendationView[] };
  approvals: { items: ApprovalView[] };
  portfolio: { items: PortfolioView[] };
  documents: { items: DocumentView[] };
  team: { items: TeamActivityView[] };
};

export type PipelineBoard = {
  totalLabel: string;
  columns: Array<{ name: string; count: number; value: string; more: number; deals: Array<{ id: string; name: string; round: string; sector: string; amount: string; activity: string; lead: PersonChip }> }>;
};

export type PeopleRow = { id: string; name: string; initials: string; tone: number; title: string; org: string; owner: string; last: string; strength: string | null };
export type CrmConnectionState = 'connected' | 'connect_required' | 'not_configured';

export type PeopleResponse = { status: 'ok'; sample: boolean; rows: PeopleRow[]; nextCursor: string | null } | { status: 'not_connected' } | { status: 'connect_required' } | { status: 'error'; message: string };

// ---- Records, meetings, search, notifications -------------------------------------------------------------

export type RecordAction = 'draft_note' | 'log_interaction' | 'create_task' | 'approve' | 'ask' | 'open_pipeline' | 'summarize' | 'open_external' | 'message' | 'summarize_week' | 'research';

export type RecordPreview = {
  kind: RecordKind | 'company';
  id: string;
  kindLabel: string;
  title: string;
  subtitle: string;
  sample: boolean;
  avatar: PersonChip | null;
  icon: IconName;
  fields: Array<{ label: string; value: string }>;
  stages: Array<{ label: string; state: 'done' | 'cur' | 'todo' }> | null;
  progress: number | null;
  openCommitment: string | null;
  aiSuggestion: string | null;
  activity: Array<{ date: string; text: string }>;
  related: Array<{ kind: RecordKind | 'company'; id: string; label: string; icon: IconName; meetingId?: string }>;
  access: string;
  actions: RecordAction[];
  approval: { id: string; title: string; requestedBy: string } | null;
  // How each AI action on this record is asked; decided server-side so the client holds no data-source logic.
  asks: Partial<Record<'ask' | 'summarize' | 'summarize_week' | 'research' | 'draft_note', { question: string; key?: string; ref?: string }>>;
  isPublicOfficial: boolean;
  org: string | null;
};

export type MeetingPrep = {
  meeting: MeetingView;
  summary: string;
  isPublicOfficial: boolean;
  participants: Array<PersonChip & { id: string; title: string; org: string; strength: string; last: string }>;
  history: Array<{ date: string; text: string; by: string }>;
  documents: DocumentView[];
  developments: string[];
  topics: string[];
  followups: Array<{ text: string; who: string; due: string; tone: 'ac' | 'wn' | 'tx'; done: boolean }>;
  prepared: boolean;
};

export type SearchResultKind = 'person' | 'company' | 'deal' | 'project' | 'meeting' | 'document' | 'task';
export type SearchResult = { kind: SearchResultKind; id: string; label: string; sub: string; icon: IconName; record: { kind: RecordKind | 'company'; id: string } | { kind: 'meeting'; id: string } };
export type SearchResponse = { results: SearchResult[]; recent: SearchResult[] };

export type NotificationView = { id: string; text: string; time: string; icon: IconName; ai: boolean; unread: boolean; target: { kind: 'prep'; meetingId: string } | { kind: RecordKind; id: string } };
export type NotificationsResponse = { status: 'ok'; sample: boolean; items: NotificationView[] } | { status: 'empty' };

// ---- AI ------------------------------------------------------------------------------------------------------

export type AiMessageView =
  | { id: string; role: 'user'; text: string; createdAt: string }
  | { id: string; role: 'assistant'; answer: AiAnswer; style: string; provider: AiProviderKind; model: string | null; createdAt: string; completedActions: number[] };

export type AiConversationView = { id: string | null; provider: AiProviderKind; messages: AiMessageView[] };

export type ConfirmOrigin =
  | { type: 'ai_message'; messageId: string; actionIndex: number }
  | { type: 'recommendation'; id: string }
  | { type: 'meeting_followups'; meetingId: string }
  | { type: 'approval'; id: string };

export type ConfirmResult = { ok: true; message: string; simulated: boolean };

// ---- Workstyle -----------------------------------------------------------------------------------------------

export type WorkstyleSummary = {
  present: boolean;
  reviewed: boolean;
  consentGiven: boolean;
  status: 'extracted' | 'partial' | 'unrecognized' | 'unreadable' | 'manual' | 'sample' | null;
  acceptedCount: number;
};

export type WorkstyleRecommendationChange = { id: WsRecommendationId; status?: 'pending' | 'accepted' | 'dismissed'; choice?: string } | { acceptAll: true };

export type WorkstyleRecommendationView = { id: WsRecommendationId; choice: string; status: 'pending' | 'accepted' | 'dismissed'; insight: string };

export type WorkstyleDetail = {
  present: boolean;
  consentGiven: boolean;
  sourceKind: 'upload' | 'manual' | 'sample' | null;
  fileName: string | null;
  addedAt: string | null;
  extraction: { status: WorkstyleSummary['status']; foundCount: number; expectedCount: number; parserVersion: string | null; pageCount: number | null };
  draft: WorkstyleProfileDraft | null;
  found: { disc: Partial<Record<'D' | 'I' | 'S' | 'C', { natural: boolean; adapted: boolean }>>; drivingForces: Partial<Record<string, boolean>> } | null;
  profile: WorkstyleProfile | null;
  recommendations: WorkstyleRecommendationView[];
  recommendationStates: WsRecommendationStates | null;
  baseline: { density: string; aiStyle: string; prepFormat: string; taskGroup: string; notifMode: string; draftTone: string; layout: DashboardLayout['layout'] } | null;
  sharing: { manager: boolean; colleagues: boolean };
  retainOriginal: boolean;
};

// ---- Documents -----------------------------------------------------------------------------------------------

export type DocumentRow = {
  id: string;
  fileName: string;
  mimeType: string;
  sizeBytes: number;
  visibility: DocumentVisibility;
  relatedLabel: string;
  status: DocumentStatus;
  statusMessage: string | null;
  noAi: boolean;
  pageCount: number | null;
  owner: { name: string; isYou: boolean };
  createdAt: string;
  canChange: boolean;
};

export type DocumentListResponse = { status: 'ok'; documents: DocumentRow[]; nextCursor: string | null } | { status: 'not_configured' };

export type DocumentContentView =
  | {
      status: 'ready';
      engine: string | null;
      pageCount: number | null;
      pages: Array<{ pageNumber: number; text: string; method: string | null }>;
      tables: Array<{ index: number; pageNumber: number | null; caption: string | null; cells: string[][] }>;
    }
  | { status: 'not_ready' | 'no_ai' };

// Snippets mark matches with << and >>; the browser renders them as highlights, never as HTML.
export type DocumentSearchResponse = { results: Array<{ documentId: string; fileName: string; pageNumber: number; snippet: string }> };

export type ApiErrorBody = { error: { code: string; message: string; issues?: Array<{ path: string; message: string }>; requestId?: string } };

export type { AiAnswer, SourceRef };
