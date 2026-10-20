import 'server-only';
import { DEMO_DEALS, DEMO_DOCS, DEMO_MEET, DEMO_MEET_BY, DEMO_PEOPLE, DEMO_PROJECTS } from '@/demo/sample-records';
import type { SearchResponse, SearchResult } from '@/lib/api/contracts';
import type { ProviderContext } from '../types';
import { DEMO_STAGES, matchesQuery, selfPersonId } from './helpers';

const GROUP_LIMITS: Record<SearchResult['kind'], number> = { person: 5, company: 4, deal: 4, project: 4, meeting: 3, document: 4, task: 4 };

function allResults(context: ProviderContext): SearchResult[] {
  const self = selfPersonId(context);
  const people: SearchResult[] = Object.entries(DEMO_PEOPLE)
    .filter(([id]) => id !== self)
    .map(([id, person]) => ({ kind: 'person', id, label: person.name, sub: `${person.title} · ${person.org}`, icon: 'user', record: { kind: 'contact', id } }));
  const orgs = [...new Set(Object.values(DEMO_PEOPLE).map((person) => person.org).filter((org) => org !== 'RSM Capital'))];
  const companies: SearchResult[] = orgs.map((org) => ({ kind: 'company', id: org, label: org, sub: 'Company', icon: 'company', record: { kind: 'company', id: org } }));
  const deals: SearchResult[] = Object.entries(DEMO_DEALS).map(([id, deal]) => ({ kind: 'deal', id, label: deal.name, sub: `${deal.round} · ${DEMO_STAGES[deal.stage] ?? ''}`, icon: 'pipeline', record: { kind: 'deal', id } }));
  const projects: SearchResult[] = Object.entries(DEMO_PROJECTS).map(([id, project]) => ({ kind: 'project', id, label: project.name, sub: project.status, icon: 'folder', record: { kind: 'project', id } }));
  const meetings: SearchResult[] = (DEMO_MEET_BY[context.persona] ?? []).flatMap((id) => {
    const meeting = DEMO_MEET[id];
    return meeting ? [{ kind: 'meeting' as const, id, label: meeting.title, sub: `Today · ${meeting.time}`, icon: 'calendar' as const, record: { kind: 'meeting' as const, id } }] : [];
  });
  const docs: SearchResult[] = Object.entries(DEMO_DOCS).map(([id, doc]) => ({ kind: 'document', id, label: doc.name, sub: doc.meta, icon: 'doc', record: { kind: 'doc', id } }));
  return [...people, ...companies, ...deals, ...projects, ...meetings, ...docs];
}

export function demoSearch(query: string, context: ProviderContext): SearchResponse {
  const all = allResults(context);
  const recent = [
    all.find((result) => result.kind === 'deal' && result.id === 'd1'),
    all.find((result) => result.kind === 'person' && result.id === 'c1'),
    all.find((result) => result.kind === 'project' && result.id === 'p2'),
    all.find((result) => result.kind === 'document' && result.id === 'doc2'),
  ].filter((result): result is SearchResult => Boolean(result));
  if (!query.trim()) return { results: [], recent };
  const counts = new Map<SearchResult['kind'], number>();
  const results = all.filter((result) => {
    if (!matchesQuery(query, result.label, result.sub)) return false;
    const used = counts.get(result.kind) ?? 0;
    if (used >= GROUP_LIMITS[result.kind]) return false;
    counts.set(result.kind, used + 1);
    return true;
  });
  return { results, recent };
}
