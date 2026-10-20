import 'server-only';
import { DEMO_HIGHLIGHTS, DEMO_NOW_MINUTES, DEMO_PERSONAS, demoBriefBody } from '@/demo/personas';
import {
  DEMO_APPROVALS,
  DEMO_ATT,
  DEMO_DEALS,
  DEMO_DOCS,
  DEMO_GOV,
  DEMO_INTEL,
  DEMO_MEET,
  DEMO_MEET_BY,
  DEMO_NOTIFS,
  DEMO_PEOPLE,
  DEMO_PORTFOLIO,
  DEMO_PROJECTS,
  DEMO_RECON,
  DEMO_RECS,
  DEMO_STAGE_STATS,
  DEMO_TEAM,
} from '@/demo/sample-records';
import type { AttentionItemView, MeetingView, WidgetDataMap, WidgetResponse } from '@/lib/api/contracts';
import type { ProviderContext, ProviderWidgetId, WorkspaceDataProvider } from '../types';
import { chipFor, DEMO_STAGES, dueRank, GOV_STEPS, GOV_STEPS_REGULATORY, ownerName, selfPersonId, stateOf, toneForPersonName } from './helpers';
import { demoMeetingPrep } from './demo-prep';
import { demoRecord } from './demo-records';
import { demoSearch } from './demo-search';

const ok = <TData>(data: TData): WidgetResponse<TData> => ({ status: 'ok', sample: true, data });

export function demoMeetingView(id: string, context: ProviderContext): MeetingView | null {
  const meeting = DEMO_MEET[id];
  if (!meeting) return null;
  const prepared = Boolean(stateOf(context, `meeting:${id}`).prepared);
  const self = selfPersonId(context);
  return {
    id,
    time: meeting.time,
    startMinutes: meeting.start,
    duration: meeting.dur,
    title: meeting.title,
    org: meeting.org,
    attendees: meeting.people.filter((personId) => personId !== self).flatMap((personId) => {
      const person = DEMO_PEOPLE[personId];
      return person ? [chipFor(person.name, person.tone)] : [];
    }),
    includesViewer: true,
    related: meeting.rk && meeting.rid ? { kind: meeting.rk, id: meeting.rid, label: meeting.related } : null,
    prepLabel: prepared ? 'Prepared' : meeting.prep,
    prepTone: prepared ? 'ok' : meeting.prepTone,
    where: meeting.where,
  };
}

function personaMeetings(context: ProviderContext): MeetingView[] {
  return (DEMO_MEET_BY[context.persona] ?? []).flatMap((id) => {
    const view = demoMeetingView(id, context);
    return view ? [view] : [];
  });
}

const widgetBuilders: { [TId in ProviderWidgetId]: (context: ProviderContext) => WidgetDataMap[TId] } = {
  meetings: (context) => ({ meetings: personaMeetings(context), nowMinutes: DEMO_NOW_MINUTES }),
  relationships: (context) => ({
    people: (DEMO_RECON[context.persona] ?? []).flatMap((id) => {
      const person = DEMO_PEOPLE[id];
      if (!person) return [];
      return [
        {
          id,
          name: person.name,
          initials: chipFor(person.name, person.tone).initials,
          tone: person.tone,
          title: person.title,
          org: person.org,
          strength: person.strength ?? null,
          lastInteraction: person.last ?? '—',
          owner: ownerName(person.owner, context),
          recordedFact: person.fact ?? '',
          suggestion: person.suggest ?? '',
        },
      ];
    }),
  }),
  pipeline: () => {
    const maxCount = 23;
    return {
      totalLabel: '32 active opportunities · $230M target allocation (sample)',
      stages: DEMO_STAGES.map((name, index) => {
        const stat = DEMO_STAGE_STATS[index] ?? { count: 0, value: '—', delta: '0', dir: 'flat' as const };
        return { name, count: stat.count, value: stat.value, delta: stat.dir === 'up' ? `${stat.delta} wk` : '—', dir: stat.dir, pct: Math.round((stat.count / maxCount) * 100), neutral: index === 5 };
      }),
      moves: ['d2', 'd3', 'd1', 'd5', 'd4', 'd6'].flatMap((id) => {
        const deal = DEMO_DEALS[id];
        if (!deal) return [];
        return [{ id, name: deal.name, round: deal.round, stage: DEMO_STAGES[deal.stage] ?? '', change: deal.change, lead: chipFor(deal.lead, toneForPersonName(deal.lead)), amount: deal.amount }];
      }),
    };
  },
  projects: (context) => ({
    projects: Object.entries(DEMO_PROJECTS)
      .filter(([, project]) => project.pids.includes(context.persona))
      .map(([id, project]) => {
        const owner = ownerName(project.owner, context);
        return {
          id,
          name: project.name,
          kind: project.kind,
          status: project.status,
          tone: project.tone,
          pct: project.pct,
          activity: project.activity,
          milestone: project.milestone,
          milestoneDate: project.mdate,
          owner: { ...chipFor(owner.replace(' (you)', ''), project.ownerTone), name: owner },
          openTasks: project.tasks,
        };
      }),
  }),
  intel: (context) => ({
    items: DEMO_INTEL.filter((item) => item.pids.includes(context.persona)).map((item) => ({
      id: item.id,
      topic: item.topic,
      source: item.source,
      date: item.date,
      headline: item.headline,
      why: item.why,
      saved: Boolean(stateOf(context, `intel:${item.id}`).saved),
      related: { kind: item.rk, id: item.rid },
    })),
  }),
  govaffairs: () => ({
    items: DEMO_GOV.map((item) => {
      const labels = item.id === 'g1' ? GOV_STEPS : GOV_STEPS_REGULATORY;
      return {
        id: item.id,
        title: item.title,
        jurisdiction: item.juris,
        position: item.position,
        change: item.change,
        changeTone: item.chipCls === 'chip-ac' ? ('accent' as const) : item.chipCls === 'chip-wn' ? ('warn' as const) : ('neutral' as const),
        steps: labels.map((label, index) => ({ label, state: index < item.cur ? ('done' as const) : index === item.cur ? ('cur' as const) : ('todo' as const) })),
        next: item.next,
        related: item.rk && item.rid ? { kind: item.rk, id: item.rid } : null,
      };
    }),
  }),
  airecs: (context) => ({
    items: (DEMO_RECS[context.persona] ?? [])
      .filter((rec) => {
        const state = stateOf(context, `rec:${rec.id}`);
        return !state.dismissed && !state.done;
      })
      .map((rec) => ({ id: rec.id, text: rec.text, basis: rec.basis, actionLabel: rec.actLabel, kind: rec.kind, question: rec.q ?? null })),
  }),
  approvals: (context) => ({
    items: DEMO_APPROVALS.map((approval) => ({
      id: approval.id,
      title: approval.title,
      requestedBy: approval.by,
      due: approval.due,
      dueTone: approval.dueTone,
      approved: Boolean(stateOf(context, `approval:${approval.id}`).approved),
      record: { kind: approval.rk, id: approval.rid },
    })),
  }),
  portfolio: () => ({ items: DEMO_PORTFOLIO.map((item) => ({ ...item })) }),
  documents: (context) => ({
    items: Object.entries(DEMO_DOCS)
      .filter(([, doc]) => doc.pids.includes(context.persona))
      .map(([id, doc]) => ({ id, name: doc.name, meta: doc.meta, kind: doc.kind })),
  }),
  team: () => ({ items: DEMO_TEAM.map((entry) => ({ ...chipFor(entry.who, entry.tone), what: entry.what, when: entry.when })) }),
};

export const demoProvider: WorkspaceDataProvider = {
  mode: 'demo',

  async widget(id, context) {
    const build = widgetBuilders[id] as (context: ProviderContext) => WidgetDataMap[typeof id];
    return ok(build(context));
  },

  async externalAttention(context) {
    return DEMO_ATT.filter((item) => item.pids.includes(context.persona) && !stateOf(context, `att:${item.id}`).dismissed).map(
      (item): AttentionItemView => ({
        key: `demo:${item.id}`,
        title: item.title,
        priority: item.p,
        type: item.type,
        typeIcon: item.typeIcon,
        related: { label: item.related, record: { kind: item.rk, id: item.rid } },
        due: { kind: 'label', label: item.due, tone: item.dueTone, rank: dueRank(item.due) },
        action: item.act,
        actionLabel: item.actLabel,
        sourceNote: item.source,
        meetingId: item.mid ?? null,
        approvalId: item.apId ?? null,
        done: Boolean(stateOf(context, `att:${item.id}`).done),
      }),
    );
  },

  async brief(context, attentionOpenCount) {
    const meetings = personaMeetings(context);
    const next = meetings.find((meeting) => meeting.startMinutes > DEMO_NOW_MINUTES) ?? meetings[0];
    const pendingApprovals = DEMO_APPROVALS.filter((approval) => !stateOf(context, `approval:${approval.id}`).approved).length;
    const isExec = context.persona === 'exec';
    return ok({
      body: demoBriefBody(context.persona, { meetings: meetings.length, openItems: attentionOpenCount, pendingApprovals }),
      synthesized: true,
      provenance: 'From your calendar, tasks and CRM · 7:02 AM · simulated',
      stats: [
        { key: 'meetings', value: String(meetings.length), label: 'Meetings today', target: next ? { kind: 'prep', meetingId: next.id } : { kind: 'settings', tab: 'apps' } },
        { key: 'tasks', value: String(attentionOpenCount), label: 'Need your attention', target: { kind: 'tab', tab: 'tasks' } },
        { key: 'opps', value: context.persona === 'vc' ? '4' : '2', label: 'Opportunities moving', target: { kind: 'nav', href: '/pipeline' } },
        isExec
          ? { key: 'followups', value: String(pendingApprovals), label: 'Decisions waiting', target: { kind: 'ask', question: 'What decisions are waiting on me?', key: 'decisions' } }
          : { key: 'followups', value: '3', label: 'Follow-ups from last week', target: { kind: 'ask', question: 'Summarize my outstanding follow-ups.', key: 'followups' } },
      ],
      highlights: DEMO_HIGHLIGHTS[context.persona].map((highlight) => ({
        kicker: highlight.kicker,
        title: highlight.title,
        meta: highlight.meta,
        accent: Boolean(highlight.accent),
        target: highlight.target.kind === 'prep' ? { kind: 'prep', meetingId: highlight.target.meetingId } : { kind: highlight.target.kind, id: highlight.target.id },
      })),
    });
  },

  async record(kind, id, context) {
    return demoRecord(kind, id, context);
  },

  async meetingPrep(meetingId, context) {
    return demoMeetingPrep(meetingId, context);
  },

  async search(query, context) {
    return demoSearch(query, context);
  },

  async notifications(context) {
    const read = Boolean(stateOf(context, 'notif:all').read);
    return {
      status: 'ok',
      sample: true,
      items: DEMO_NOTIFS.map((notification) => ({
        id: notification.id,
        text: notification.text,
        time: notification.time,
        icon: notification.icon,
        ai: Boolean(notification.ai),
        unread: !read,
        target: 'prep' in notification.go ? { kind: 'prep', meetingId: notification.go.prep } : { kind: notification.go.kind, id: notification.go.id },
      })),
    };
  },
};

export function demoPersonaName(context: ProviderContext): string {
  const persona = DEMO_PERSONAS[context.persona];
  return [persona.first, persona.last].filter(Boolean).join(' ');
}
