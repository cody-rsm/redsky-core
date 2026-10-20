import 'server-only';
import { DEMO_APPROVALS, DEMO_DEALS, DEMO_DOCS, DEMO_MEET, DEMO_MEET_BY, DEMO_PEOPLE, DEMO_PROJECTS } from '@/demo/sample-records';
import type { RecordKind } from '@/features/ai/types';
import type { RecordPreview } from '@/lib/api/contracts';
import type { ProviderContext } from '../types';
import { chipFor, DEMO_STAGES, ownerName, stateOf } from './helpers';

const PROJECT_DOCS: Record<string, string[]> = { p1: ['doc1', 'doc7'], p2: ['doc2', 'doc9'], p3: ['doc5'] };

function base(kind: RecordPreview['kind'], id: string): RecordPreview {
  return {
    kind,
    id,
    kindLabel: '',
    title: '',
    subtitle: '',
    sample: true,
    avatar: null,
    icon: 'doc',
    fields: [],
    stages: null,
    progress: null,
    openCommitment: null,
    aiSuggestion: null,
    activity: [],
    related: [],
    access: '',
    actions: [],
    approval: null,
    asks: {},
    isPublicOfficial: false,
    org: null,
  };
}

export function demoRecord(kind: RecordKind | 'company', id: string, context: ProviderContext): RecordPreview | null {
  if (kind === 'contact') {
    const person = DEMO_PEOPLE[id];
    if (!person) return null;
    const meetingId = Object.keys(DEMO_MEET).find((key) => DEMO_MEET[key]?.people.includes(id) && (DEMO_MEET_BY[context.persona] ?? []).includes(key));
    const deals = Object.entries(DEMO_DEALS).filter(([, deal]) => deal.name === person.org);
    const owner = ownerName(person.owner, context);
    return {
      ...base('contact', id),
      kindLabel: person.internal ? 'Colleague' : 'Person',
      title: person.name,
      subtitle: `${person.title} · ${person.org}`,
      avatar: chipFor(person.name, person.tone),
      icon: 'user',
      fields: [
        { label: 'Organization', value: person.org },
        { label: 'Relationship owner', value: owner },
        { label: 'Strength', value: person.strength ?? 'Colleague' },
        { label: 'Last interaction', value: person.last ?? '—' },
        ...(person.gov ? [{ label: 'Classification', value: 'Public official — disclosure rules apply' }] : []),
      ],
      openCommitment: person.fact ?? null,
      aiSuggestion: person.suggest ?? null,
      activity: (person.act ?? [{ d: '—', t: 'No recorded interactions yet' }]).map((entry) => ({ date: entry.d, text: entry.t })),
      related: [
        ...(meetingId ? [{ kind: 'meeting' as const, id: meetingId, label: `Today · ${DEMO_MEET[meetingId]?.title ?? ''}`, icon: 'calendar' as const, meetingId }] : []),
        ...deals.map(([dealId, deal]) => ({ kind: 'deal' as const, id: dealId, label: `${deal.name} · ${deal.round}`, icon: 'pipeline' as const })),
      ],
      access: `Owner: ${owner}`,
      actions: person.internal ? ['message'] : ['draft_note', 'log_interaction', 'create_task'],
      asks: { draft_note: { question: `Draft a note to ${person.name}`, key: 'draft', ref: id } },
      isPublicOfficial: Boolean(person.gov),
      org: person.org,
    };
  }

  if (kind === 'deal') {
    const deal = DEMO_DEALS[id];
    if (!deal) return null;
    const people = Object.entries(DEMO_PEOPLE).filter(([, person]) => person.org === deal.name);
    const docs = Object.entries(DEMO_DOCS).filter(([, doc]) => doc.name.indexOf(deal.name.split(' ')[0] ?? '') === 0);
    const approval = DEMO_APPROVALS.find((entry) => entry.rk === 'deal' && entry.rid === id);
    const canApprove = Boolean(approval && !stateOf(context, `approval:${approval.id}`).approved && context.persona === 'exec');
    return {
      ...base('deal', id),
      kindLabel: 'Opportunity',
      title: deal.name,
      subtitle: `${deal.round} · ${deal.sector}`,
      icon: 'pipeline',
      fields: [
        { label: 'Stage', value: DEMO_STAGES[deal.stage] ?? '' },
        { label: 'Target allocation', value: `${deal.amount} (sample)` },
        { label: 'Deal lead', value: deal.lead },
        { label: 'Latest', value: deal.activity },
      ],
      stages: DEMO_STAGES.map((label, index) => ({ label, state: index < deal.stage ? 'done' : index === deal.stage ? 'cur' : 'todo' })),
      aiSuggestion:
        deal.stage <= 1
          ? 'Schedule a partner screen after the intro and request data-room access.'
          : deal.stage === 3
            ? 'Assign a pre-read owner and confirm co-investor allocations before IC.'
            : 'Close out open diligence items before advancing the stage.',
      activity: [
        { date: 'This week', text: deal.activity },
        { date: 'Earlier', text: `Stage change: ${deal.change}` },
      ],
      related: [
        ...people.map(([personId, person]) => ({ kind: 'contact' as const, id: personId, label: person.name, icon: 'user' as const })),
        ...docs.map(([docId, doc]) => ({ kind: 'doc' as const, id: docId, label: doc.name, icon: 'doc' as const })),
      ],
      access: 'Deal team and investment committee',
      actions: canApprove ? ['ask', 'approve', 'open_pipeline'] : ['ask', 'open_pipeline'],
      approval: canApprove && approval ? { id: approval.id, title: approval.title, requestedBy: approval.by } : null,
      asks: { ask: { question: `Find everything we know about ${deal.name}`, key: id === 'd1' ? 'company' : 'generic' } },
      org: deal.name,
    };
  }

  if (kind === 'project') {
    const project = DEMO_PROJECTS[id];
    if (!project) return null;
    const docs = PROJECT_DOCS[id] ?? [];
    return {
      ...base('project', id),
      kindLabel: 'Project',
      title: project.name,
      subtitle: project.kind,
      icon: 'folder',
      fields: [
        { label: 'Status', value: project.status },
        { label: 'Owner', value: ownerName(project.owner, context) },
        { label: 'Next milestone', value: `${project.milestone} · ${project.mdate}` },
        { label: 'Needs attention', value: `${project.tasks} ${project.tasks === 1 ? 'task' : 'tasks'}` },
      ],
      progress: project.pct,
      activity: [{ date: 'Latest', text: project.activity }],
      aiSuggestion: project.tone !== 'ok' ? (id === 'p2' ? 'Move the stakeholder memo up to Wednesday and confirm sign-off from coalition members today.' : 'Confirm the decision owner and date to keep the milestone on schedule.') : null,
      related: docs.flatMap((docId) => {
        const doc = DEMO_DOCS[docId];
        return doc ? [{ kind: 'doc' as const, id: docId, label: doc.name, icon: 'doc' as const }] : [];
      }),
      access: 'Project members',
      actions: ['summarize_week', 'create_task'],
      asks: { summarize_week: { question: 'What happened across my projects this week?', key: 'projects' } },
      org: project.name,
    };
  }

  if (kind === 'doc') {
    const doc = DEMO_DOCS[id];
    if (!doc) return null;
    const metaParts = doc.meta.split(' · ');
    return {
      ...base('doc', id),
      kindLabel: 'Document',
      title: doc.name,
      subtitle: `${doc.kind} · ${doc.meta}`,
      icon: 'doc',
      fields: [
        { label: 'Type', value: doc.kind },
        { label: 'Location', value: metaParts[0] ?? '' },
        { label: 'Last change', value: metaParts.slice(1).join(' · ') },
      ],
      activity: [{ date: metaParts[metaParts.length - 1] ?? '', text: 'Latest version' }],
      access: 'Existing SharePoint permissions',
      actions: ['summarize', 'open_external'],
      asks: { summarize: { question: `Summarize ${doc.name}`, key: id === 'doc4' ? 'summarize' : 'generic' } },
    };
  }

  if (kind === 'company') {
    const people = Object.entries(DEMO_PEOPLE).filter(([, person]) => person.org === id);
    const deals = Object.entries(DEMO_DEALS).filter(([, deal]) => deal.name === id);
    if (people.length === 0 && deals.length === 0) return null;
    return {
      ...base('company', id),
      kindLabel: 'Company',
      title: id,
      subtitle: deals[0]?.[1].sector ?? 'Organization',
      icon: 'company',
      fields: [
        { label: 'People', value: String(people.length) },
        { label: 'Opportunities', value: String(deals.length) },
      ],
      activity: people
        .filter(([, person]) => person.last)
        .map(([, person]) => {
          const [date, ...rest] = (person.last ?? '').split(' · ');
          return { date: date ?? '', text: `${person.name} — ${rest.join(' · ')}` };
        }),
      related: [
        ...people.map(([personId, person]) => ({ kind: 'contact' as const, id: personId, label: person.name, icon: 'user' as const })),
        ...deals.map(([dealId, deal]) => ({ kind: 'deal' as const, id: dealId, label: `${deal.name} · ${deal.round}`, icon: 'pipeline' as const })),
      ],
      access: 'All RSM staff',
      actions: ['research'],
      asks: { research: { question: `Find everything we know about ${id}`, key: id === 'Halcyon Robotics' ? 'company' : 'research', ref: id } },
      org: id,
    };
  }

  return null;
}
