import type { IconName } from '@/components/ui/icon';

export const WS_EXTRACTION_ITEMS: ReadonlyArray<{ label: string; icon: IconName }> = [
  { label: 'DISC behavioral characteristics', icon: 'activity' },
  { label: 'Natural and adapted behavioral styles', icon: 'refresh' },
  { label: '12 Driving Forces', icon: 'compass' },
  { label: 'Communication preferences', icon: 'chat' },
  { label: 'Decision-making preferences', icon: 'target' },
  { label: 'Motivational characteristics', icon: 'flag' },
  { label: 'Preferred working environment', icon: 'home' },
];

export const WS_PROMISES: ReadonlyArray<string> = [
  'Private to you by default — not visible to managers or colleagues',
  'Shared only with your explicit, revocable consent',
  'Never used for ranking, performance evaluation, hiring or employment decisions',
  'Suggestions only — you control every setting',
  'Remove your assessment data at any time',
];

// Versioned so a consent record always names the exact wording the employee agreed to.
export const WS_CONSENT_VERSION = '2026-10-19';
export const WS_CONSENT_TEXT = {
  title: 'I consent to RedSky processing my assessment to personalize my workspace.',
  body: "It stays private to me and isn't shared with my manager or colleagues unless I choose to. It is never used for evaluation or employment decisions.",
  shortBody: 'Private to me; never used for evaluation or employment decisions.',
};

export const DISC_FACTORS = [
  { key: 'D', name: 'Dominance' },
  { key: 'I', name: 'Influence' },
  { key: 'S', name: 'Steadiness' },
  { key: 'C', name: 'Compliance' },
] as const;
export type DiscKey = (typeof DISC_FACTORS)[number]['key'];

// The 12 TTI Driving Forces as six two-pole motivators. Position 0 = left pole, 100 = right pole.
export const DRIVING_FORCE_SCALES = [
  { key: 'knowledge', motivator: 'Knowledge', left: 'Instinctive', right: 'Intellectual' },
  { key: 'utility', motivator: 'Utility', left: 'Selfless', right: 'Resourceful' },
  { key: 'surroundings', motivator: 'Surroundings', left: 'Objective', right: 'Harmonious' },
  { key: 'others', motivator: 'Others', left: 'Altruistic', right: 'Intentional' },
  { key: 'power', motivator: 'Power', left: 'Collaborative', right: 'Commanding' },
  { key: 'methodologies', motivator: 'Methodologies', left: 'Structured', right: 'Receptive' },
] as const;
export type DrivingForceKey = (typeof DRIVING_FORCE_SCALES)[number]['key'];

export const WORK_PREFERENCE_FIELDS = [
  { key: 'communication', label: 'Communication', icon: 'chat' },
  { key: 'decisionMaking', label: 'Decision-making', icon: 'target' },
  { key: 'motivation', label: 'Motivation', icon: 'flag' },
  { key: 'environment', label: 'Environment', icon: 'home' },
] as const satisfies ReadonlyArray<{ key: string; label: string; icon: IconName }>;
export type WorkPreferenceKey = (typeof WORK_PREFERENCE_FIELDS)[number]['key'];

export const WS_RECOMMENDATION_IDS = ['layout', 'prep', 'tasks', 'comm', 'ai', 'density'] as const;
export type WsRecommendationId = (typeof WS_RECOMMENDATION_IDS)[number];

export type WsOption = { value: string; label: string; desc: string; why: string };
export type WsRecommendationDefinition = { id: WsRecommendationId; area: string; icon: IconName; options: ReadonlyArray<WsOption> };

// Option copy is the prototype's; `why` for non-default options follows the same voice (tendencies, not traits).
export const WS_RECOMMENDATIONS: ReadonlyArray<WsRecommendationDefinition> = [
  {
    id: 'layout',
    area: 'Dashboard layout',
    icon: 'layout',
    options: [
      { value: 'action', label: 'Action first', desc: 'Lead with Needs Your Attention and decisions; move background reading lower.', why: 'Puts what needs a decision where you look first; context stays one scroll away instead of in the way.' },
      { value: 'people', label: 'People first', desc: 'Lead with relationships and meetings; tasks follow.', why: 'Starts your day with the people and conversations that tend to drive your work.' },
      { value: 'keep', label: 'Keep my order', desc: 'Keep your current widget order.', why: 'Your current arrangement already reflects how you like to work.' },
    ],
  },
  {
    id: 'prep',
    area: 'Meeting preparation',
    icon: 'calendar',
    options: [
      { value: 'onepage-15', label: 'One page · 15 min', desc: 'One-page briefs that open with the people, your history and the ask — with a reminder 15 minutes before.', why: 'Keeps preparation short and centered on the conversation and the ask, rather than a long dossier.' },
      { value: 'onepage-30', label: 'One page · 30 min', desc: 'One-page, people-first briefs — with a reminder 30 minutes before.', why: 'A short brief with a little more lead time to think it through.' },
      { value: 'detailed-30', label: 'Detailed · 30 min', desc: 'Full briefs including developments and history — reminder 30 minutes before.', why: 'Gives you the full context and time to review it before you walk in.' },
    ],
  },
  {
    id: 'tasks',
    area: 'Task organization',
    icon: 'tasks',
    options: [
      { value: 'top3', label: 'Priority · Top 3', desc: 'Group tasks by priority with a daily Top 3 focus, instead of one long chronological list.', why: 'A short, flexible focus list may suit you better than a long fixed schedule.' },
      { value: 'due', label: 'Due date', desc: 'Sort tasks strictly by due date.', why: 'A predictable, dated order makes it easy to work through commitments in sequence.' },
      { value: 'relationship', label: 'Relationship', desc: 'Group tasks by the person or organization involved.', why: 'Keeps everything you owe one person or organization together.' },
    ],
  },
  {
    id: 'comm',
    area: 'Communication',
    icon: 'chat',
    options: [
      { value: 'batched', label: 'Direct · batched', desc: 'AI drafts open with the ask; non-urgent notifications arrive together at 9 AM and 3 PM.', why: 'Fewer interruptions and messages that get to the point — urgent items still come through immediately.' },
      { value: 'realtime', label: 'Direct · real-time', desc: 'AI drafts open with the ask; notifications arrive as they happen.', why: 'Messages get to the point, and you see changes as they happen.' },
      { value: 'warm', label: 'Warm · batched', desc: 'AI drafts open with context first; non-urgent notifications are batched.', why: 'Drafts that build rapport first, with fewer interruptions during the day.' },
    ],
  },
  {
    id: 'ai',
    area: 'AI response format',
    icon: 'ai',
    options: [
      { value: 'executive', label: 'Executive', desc: 'Set RedSky AI to Executive — bottom line first, with reasoning one click away.', why: 'Leads with the recommendation so you can act — or open the reasoning when you want it.' },
      { value: 'concise', label: 'Concise', desc: 'Set RedSky AI to Concise — short, actionable answers.', why: 'Short answers you can act on without reading further.' },
      { value: 'analytical', label: 'Analytical', desc: 'Set RedSky AI to Analytical — detailed reasoning and sources.', why: 'Shows the reasoning and sources so you can check the work.' },
    ],
  },
  {
    id: 'density',
    area: 'Information density',
    icon: 'grid',
    options: [
      { value: 'focused', label: 'Focused', desc: 'Use a Focused home page — four widgets, three items each.', why: 'Less to scan each morning; everything else is still one click away.' },
      { value: 'balanced', label: 'Balanced', desc: 'Keep a Balanced home page.', why: 'A mix of priorities and context without overload.' },
      { value: 'comprehensive', label: 'Comprehensive', desc: 'Use a Comprehensive home page with every widget.', why: 'A full operational overview in one place.' },
    ],
  },
];

export const WS_FUTURE: ReadonlyArray<{ label: string; desc: string; icon: IconName }> = [
  { label: 'Personalized AI meeting preparation', desc: 'Briefs that adapt to your style — and, with their consent, to attendees’ shared preferences.', icon: 'calendar' },
  { label: 'Suggested communication approaches', desc: 'Tips for working with colleagues who have chosen to share their preferences.', icon: 'chat' },
  { label: 'Individual workstyle coaching', desc: 'Private, optional nudges that only you can see.', icon: 'compass' },
  { label: 'Team collaboration summaries', desc: 'Aggregated, consent-based views of how a team prefers to work — never individual scores.', icon: 'people' },
];

export const WS_MAX_UPLOAD_BYTES = 10 * 1024 * 1024;
