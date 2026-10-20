import type { IconName } from '@/components/ui/icon';

export type AnswerKey =
  | 'next' | 'projects' | 'followups' | 'pipeline' | 'company' | 'decisions' | 'brief' | 'reconnect'
  | 'draft' | 'summarize' | 'intel' | 'module' | 'research' | 'generic';

export const SUGGESTED_PROMPTS: ReadonlyArray<{ q: string; key: AnswerKey; icon: IconName }> = [
  { q: 'Prepare me for my next meeting.', key: 'next', icon: 'calendar' },
  { q: 'What happened across my projects this week?', key: 'projects', icon: 'folder' },
  { q: 'Summarize my outstanding follow-ups.', key: 'followups', icon: 'tasks' },
  { q: 'What changed in our investment pipeline?', key: 'pipeline', icon: 'pipeline' },
  { q: 'Find everything we know about Halcyon Robotics.', key: 'company', icon: 'company' },
  { q: 'What decisions are waiting on me?', key: 'decisions', icon: 'diligence' },
];

// Keyword routing used by the simulated (demo) provider, unchanged from the prototype.
export function matchAnswerKey(question: string): AnswerKey {
  const text = question.toLowerCase();
  if (/prep|next meeting|prepare/.test(text)) return 'next';
  if (/project|this week/.test(text)) return 'projects';
  if (/follow/.test(text)) return 'followups';
  if (/pipeline|deal/.test(text)) return 'pipeline';
  if (/halcyon|everything we know/.test(text)) return 'company';
  if (/decision|approv|waiting/.test(text)) return 'decisions';
  if (/brief|today|my day/.test(text)) return 'brief';
  if (/reconnect|relationship/.test(text)) return 'reconnect';
  return 'generic';
}
