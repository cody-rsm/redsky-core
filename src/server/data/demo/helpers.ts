import 'server-only';
import { initialsFromName } from '@/components/ui/avatar';
import { DEMO_PERSONAS } from '@/demo/personas';
import { DEMO_PEOPLE } from '@/demo/sample-records';
import type { DemoPersonaId } from '@/features/preferences/schema';
import type { PersonChip } from '@/lib/api/contracts';
import type { ProviderContext } from '../types';

export const DEMO_STAGES = ['Sourcing', 'Initial Review', 'Due Diligence', 'Investment Committee', 'Negotiation', 'Closed / Portfolio'] as const;
export const GOV_STEPS = ['Introduced', 'Committee', 'Markup', 'Floor', 'Enacted'] as const;
export const GOV_STEPS_REGULATORY = ['Opened', 'Comments', 'Hearing', 'Draft order', 'Final'] as const;

function personaName(id: DemoPersonaId): string {
  const persona = DEMO_PERSONAS[id];
  return [persona.first, persona.last].filter(Boolean).join(' ');
}

// Resolves sample owner references: "@me" is the viewer, "@ga" etc. are demo personas, which become
// "<viewer> (you)" when the viewer is looking through that persona.
export function ownerName(owner: string | undefined, context: ProviderContext): string {
  if (!owner) return '—';
  if (!owner.startsWith('@')) return owner;
  const ref = owner === '@me' ? context.persona : (owner.slice(1) as DemoPersonaId);
  if (ref === context.persona) return `${context.viewerName} (you)`;
  return ref in DEMO_PERSONAS ? personaName(ref) : owner;
}

export function chipFor(name: string, tone: number): PersonChip {
  return { name, initials: initialsFromName(name), tone };
}

export function toneForPersonName(name: string): number {
  return Object.values(DEMO_PEOPLE).find((person) => person.name === name)?.tone ?? 0;
}

export function selfPersonId(context: ProviderContext): string | null {
  return DEMO_PERSONAS[context.persona].selfPersonId;
}

export function stateOf(context: ProviderContext, key: string) {
  return context.itemStates.get(key) ?? {};
}

export function dueRank(label: string): number {
  if (/overdue/.test(label)) return 0;
  if (/^Today/.test(label)) return 1;
  if (/^Tomorrow/.test(label)) return 2;
  return 3;
}

export function matchesQuery(query: string, ...fields: string[]): boolean {
  const needle = query.trim().toLowerCase();
  return fields.join(' ').toLowerCase().includes(needle);
}
