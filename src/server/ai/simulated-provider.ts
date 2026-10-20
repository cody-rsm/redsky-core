import 'server-only';
import { demoBriefBody, DEMO_PERSONAS } from '@/demo/personas';
import { DEMO_APPROVALS, DEMO_ATT, DEMO_DEALS, DEMO_DOCS, DEMO_INTEL, DEMO_MEET, DEMO_MEET_BY, DEMO_PEOPLE, DEMO_PROJECTS, DEMO_RECON } from '@/demo/sample-records';
import type { AnswerKey } from '@/features/ai/catalog';
import { SUGGESTED_PROMPTS } from '@/features/ai/catalog';
import type { AiAnswer, ProposedAction, SourceRef } from '@/features/ai/types';
import { MODULES, NAV_GROUPS, ROADMAP_PHASES, isModuleId } from '@/features/navigation/catalog';
import type { AttentionItemView } from '@/lib/api/contracts';
import { demoPrepSource } from '@/server/data/demo/demo-prep';
import type { ProviderContext } from '@/server/data/types';

// Demo-mode answers: the prototype's deterministic answer builder over sample data, labelled "Simulated" in the
// UI. Never used in production mode.

export type SimulatedInput = { key: AnswerKey; ref: string | null; context: ProviderContext; attention: AttentionItemView[] };

const src = (kind: SourceRef['kind'], id: string, label: string): SourceRef => ({ kind, id, label });

function firstName(context: ProviderContext): string {
  return context.viewerName.split(' ')[0] || 'there';
}

function meetingsFor(context: ProviderContext) {
  return (DEMO_MEET_BY[context.persona] ?? []).flatMap((id) => {
    const meeting = DEMO_MEET[id];
    return meeting ? [{ id, ...meeting }] : [];
  });
}

function dueFor(item: AttentionItemView): string {
  return item.due.kind === 'label' ? item.due.label : item.due.on;
}

export function simulatedAnswer({ key, ref, context, attention }: SimulatedInput): AiAnswer {
  const persona = context.persona;
  const self = DEMO_PERSONAS[persona].selfPersonId;
  const open = attention.filter((item) => !item.done);

  if (key === 'next') {
    const meetingId = ref && DEMO_MEET[ref] ? ref : (DEMO_MEET_BY[persona] ?? [])[0];
    const meeting = meetingId ? DEMO_MEET[meetingId] : undefined;
    const prep = meetingId ? demoPrepSource(meetingId) : null;
    if (!meetingId || !meeting || !prep) return generic();
    const names = meeting.people.filter((id) => id !== self).map((id) => DEMO_PEOPLE[id]?.name ?? '').filter(Boolean).join(' and ');
    const actions: ProposedAction[] = [{ kind: 'prep', label: 'Open the full meeting brief', desc: 'Participants, history, documents and topics', meetingId }];
    if (prep.followups.length) {
      actions.push({
        kind: 'tasks',
        label: `Add ${prep.followups.length} follow-ups to My Tasks`,
        desc: prep.followups.map((followup) => followup.t).join(' · '),
        tasks: prep.followups.map((followup) => ({ title: followup.t, related: meeting.org, due: followup.due.includes('overdue') ? 'Today' : followup.due })),
      });
    }
    return {
      bottomLine: `Your next meeting is ${meeting.title} at ${meeting.time}.`,
      short: `${meeting.title} at ${meeting.time} with ${names}. ${prep.topics[0] ?? ''}`,
      lead: `Your next meeting is ${meeting.title} at ${meeting.time} with ${names}. ${prep.summary}`,
      bullets: [...prep.topics, ...prep.followups.map((followup) => `Open follow-up: ${followup.t} (${followup.due})`)],
      reasoning: 'Prioritized items that are due today and items that block the next milestone. Topics are drawn from recorded history and linked documents; developments marked illustrative are sample content.',
      sources: [
        src('meeting', meetingId, meeting.title),
        ...(meeting.rk && meeting.rid ? [src(meeting.rk, meeting.rid, meeting.related)] : []),
        ...prep.docs.slice(0, 2).flatMap((docId) => (DEMO_DOCS[docId] ? [src('doc', docId, DEMO_DOCS[docId].name)] : [])),
      ],
      actions,
    };
  }

  if (key === 'projects') {
    const list = Object.entries(DEMO_PROJECTS).filter(([, project]) => project.pids.includes(persona));
    const risk = list.filter(([, project]) => project.tone !== 'ok');
    const first = risk[0]?.[1];
    return {
      bottomLine: `${risk.length} of ${list.length} projects need attention; the rest are on track.`,
      lead: `${list.length} of your projects had activity this week.${first ? ` ${first.name} needs attention: ${first.activity.split(' · ')[0]}.` : ''}`,
      bullets: list.map(([, project]) => `${project.name} — ${project.status.toLowerCase()}. ${project.activity.split(' · ')[0]}. Next: ${project.milestone}, ${project.mdate}.`),
      reasoning: 'Status comes from each owner’s latest update; "at risk" means a milestone has moved inside its buffer.',
      sources: list.slice(0, 4).map(([id, project]) => src('project', id, project.name)),
      actions: [{ kind: 'doc', label: 'Draft a weekly update for leadership', desc: 'Internal brief summarizing these projects' }],
    };
  }

  if (key === 'followups') {
    const overdue = open.filter((item) => /overdue/.test(dueFor(item))).length;
    const today = open.filter((item) => /Today/.test(dueFor(item))).length;
    const draftable = open.find((item) => item.action === 'draft');
    return {
      bottomLine: overdue ? 'Clear the overdue item first.' : 'Nothing overdue — two items are due today.',
      lead: `You have ${open.length} outstanding follow-ups${today ? `, ${today} due today` : ''}${overdue ? ` and ${overdue} overdue` : ''}.`,
      bullets: open.map((item) => `${dueFor(item)} — ${item.title} (${item.related.label})`),
      reasoning: 'Ordered by due date, then priority. Items come from tasks, commitments recorded in meeting notes and email capture.',
      sources: open.slice(0, 4).flatMap((item) => (item.related.record ? [src(item.related.record.kind, item.related.record.id, item.related.label)] : [])),
      actions: draftable ? [{ kind: 'draft', label: `Draft: ${draftable.title}`, desc: 'Saved to Outlook drafts — nothing is sent' }] : [],
    };
  }

  if (key === 'pipeline') {
    return {
      bottomLine: 'Pipeline momentum is up: four companies advanced this week.',
      lead: 'Three companies entered Sourcing this week, and four moved forward (illustrative sample data).',
      bullets: ['Ridgeline Grid Storage → Investment Committee; IC on Oct 28.', 'Corvid Analytics → Due Diligence; 4 of 6 customer references complete.', 'Halcyon Robotics → Initial Review; intro call today at 2:30.', 'Meridian Water Systems — term sheet redlines returned Oct 16.'],
      reasoning: 'Movement compares stage changes since last Monday. Values are target allocations, not commitments.',
      sources: ['d2', 'd3', 'd1', 'd5'].flatMap((id) => (DEMO_DEALS[id] ? [src('deal', id, DEMO_DEALS[id].name)] : [])),
      actions: [{ kind: 'nav', label: 'Open the deal pipeline', desc: 'Kanban view by stage', href: '/pipeline' }],
    };
  }

  if (key === 'company') {
    return {
      bottomLine: 'Halcyon is a warm, new opportunity — Jordan Alvarez is the relationship to lean on.',
      lead: 'RedSky found 6 records about Halcyon Robotics in email, CRM and documents you can access. RSM has no prior meetings with the company; the relationship comes through Jordan Alvarez at Brightline Ventures.',
      bullets: ['Raising a Series B; term sheet expected Nov 14 (from the Oct 12 introduction email).', 'CEO: Dana Kim. Introduced by Jordan Alvarez, a strong RSM relationship.', 'Series B deck received Oct 14 via email capture.', 'In the pipeline at Initial Review, led by Marcus Chen.', 'Intro call today at 2:30 PM.'],
      reasoning: 'Records were matched by company name and email domain; the deck was linked automatically and confirmed by Marcus Chen.',
      sources: [src('deal', 'd1', 'Halcyon Robotics · Series B'), src('contact', 'c3', 'Dana Kim'), src('contact', 'c4', 'Jordan Alvarez'), src('doc', 'doc3', 'Series B deck')],
      actions: [{ kind: 'tasks', label: 'Request data room access', desc: 'Creates a task for the deal team', tasks: [{ title: 'Request Halcyon Robotics data room access', related: 'Halcyon Robotics', due: 'Oct 20' }] }],
    };
  }

  if (key === 'decisions') {
    if (persona === 'exec') {
      return {
        bottomLine: 'Three approvals are waiting; the Ridgeline IC date is time-sensitive.',
        lead: 'Three decisions are waiting on you.',
        bullets: DEMO_APPROVALS.map((approval) => `${approval.title} — requested by ${approval.by}, ${approval.due}.`),
        reasoning: 'Pulled from the approval queue and items where you are the named decision-maker.',
        sources: DEMO_APPROVALS.map((approval) => src(approval.rk, approval.rid, approval.title.split(' — ')[0] ?? approval.title)),
        actions: [{ kind: 'preview', label: 'Open Ridgeline Grid Storage', desc: 'Review IC date and pre-read', record: { kind: 'deal', id: 'd2' } }],
      };
    }
    return {
      bottomLine: 'Two decisions are yours this week; the memo comes first.',
      lead: 'Three decisions are waiting on you.',
      bullets: ['Approve the updated stakeholder memo for the permitting coalition (due Oct 21).', 'Choose Tuesday or Wednesday for the Lone Star site review — it conflicts with Thursday prep.', 'Confirm whether RSM signs on to the coalition comment letter.'],
      reasoning: 'Drawn from projects you own and requests addressed to you.',
      sources: [src('project', 'p2', 'Grid Permitting Reform Coalition'), src('project', 'p3', 'Lone Star Microgrid')],
      actions: [
        {
          kind: 'tasks',
          label: 'Add these as tasks',
          desc: 'Three decision tasks assigned to you',
          tasks: [
            { title: 'Approve updated stakeholder memo', related: 'Grid Permitting Reform Coalition', due: 'Oct 21' },
            { title: 'Pick a new date for the Lone Star site review', related: 'Lone Star Microgrid Site Selection', due: 'Tomorrow' },
            { title: 'Decide on the coalition comment letter', related: 'Grid Permitting Reform Coalition', due: 'This week' },
          ],
        },
      ],
    };
  }

  if (key === 'brief') {
    const meetings = meetingsFor(context);
    const pendingApprovals = DEMO_APPROVALS.length;
    const body = demoBriefBody(persona, { meetings: meetings.length, openItems: open.length, pendingApprovals });
    const first = meetings[0];
    return {
      bottomLine: `${body.split('. ')[0]}.`,
      lead: body,
      bullets: [...meetings.map((meeting) => `${meeting.time} — ${meeting.title} (${meeting.prep.toLowerCase()})`), ...open.slice(0, 3).map((item) => `Priority: ${item.title} — ${dueFor(item)}`)],
      reasoning: 'Built from your calendar, open tasks, recorded commitments and the intelligence items tagged to your work.',
      sources: [
        ...meetings.slice(0, 2).map((meeting) => src('meeting', meeting.id, meeting.title)),
        ...open.slice(0, 2).flatMap((item) => (item.related.record ? [src(item.related.record.kind, item.related.record.id, item.related.label)] : [])),
      ],
      actions: first ? [{ kind: 'prep', label: `Prepare for ${first.title}`, desc: first.time, meetingId: first.id }] : [],
    };
  }

  if (key === 'reconnect') {
    const list = (DEMO_RECON[persona] ?? []).flatMap((id) => (DEMO_PEOPLE[id] ? [{ id, person: DEMO_PEOPLE[id] }] : []));
    const lead = list[0]?.person;
    return {
      bottomLine: `${lead?.name ?? 'Your top contact'} is the most important reconnect this week.`,
      lead: 'Four relationships warrant attention, based on time since contact, open commitments and upcoming events.',
      bullets: list.map(({ person }) => `${person.name} (${person.org}) — ${person.fact ?? ''}`),
      reasoning: 'Ranked by open commitments first, then time since last meaningful interaction relative to the relationship’s usual cadence.',
      sources: list.map(({ id, person }) => src('contact', id, person.name)),
      actions: [{ kind: 'draft', label: `Draft a note to ${lead?.name ?? 'your contact'}`, desc: 'Saved to Outlook drafts — nothing is sent' }],
    };
  }

  if (key === 'draft') {
    const item = DEMO_ATT.find((entry) => entry.id === ref);
    const person = (item ? DEMO_PEOPLE[item.rid] : null) ?? (ref ? DEMO_PEOPLE[ref] : null) ?? null;
    const me = firstName(context);
    const drafts: Record<string, string> = {
      a1: `Hi Priya,\n\nAhead of this morning’s call, I’ve attached the revised partnership term outline (v3). The main change reflects the interconnection timeline you shared on Oct 9. Tom will also send the permitting-coalition contacts today.\n\nLooking forward to walking through it at 9:30.\n\n${me}`,
      a3: `Hi Elena,\n\nApologies for the delay on the permitting comments I promised in September — they’re attached. With the committee markup now on Thursday, could we find 20 minutes before then to compare notes?\n\nBest,\n${me}`,
      a10: `Jordan,\n\nThank you for introducing us to Dana and the Halcyon team. Today’s conversation was a great start; we’ll follow up on next steps this week.\n\nBest,\n${me}`,
    };
    const name = person?.name ?? item?.related ?? 'the recipient';
    const text = (ref ? drafts[ref] : undefined) ?? `Hi ${name.split(' ')[0]},\n\nI wanted to follow up on our recent conversation and share an update from RSM. Would you have time for a short call this week?\n\nBest,\n${me}`;
    const toneNote = context.preferences.draftTone === 'warm' ? ' Drafted context-first, per your communication preference.' : context.preferences.draftTone === 'direct' ? ' Drafted to open with the ask, per your communication preference.' : '';
    return {
      bottomLine: 'Draft ready for your review.',
      lead: `Here’s a draft for "${item?.title ?? `a note to ${name}`}". It uses your recorded history with ${name}.${toneNote}`,
      draft: text,
      bullets: [],
      reasoning: 'Tone matched to previous correspondence; facts limited to recorded interactions and linked documents.',
      sources: item ? [src(item.rk, item.rid, item.related)] : person && ref ? [src('contact', ref, person.name)] : [],
      actions: [{ kind: 'draft', label: 'Save as Outlook draft', desc: `To ${name} — nothing is sent` }],
    };
  }

  if (key === 'summarize') {
    return {
      bottomLine: 'The memo supports a seed investment, with one open question on market size.',
      lead: 'Summary of "Tessellate Energy — Seed investment memo" (uploaded Oct 17 by Hannah Brooks).',
      bullets: ['Proposes a $3.0M seed investment in grid-analytics software for utilities.', 'Two pilot utilities; one converting to a paid contract in Q1 (per memo).', 'Key risk: long utility sales cycles.', 'Open question: the market-size figure differs from the linked research report (illustrative).'],
      reasoning: 'Summarized from the memo text only; external figures were not re-verified.',
      sources: [src('doc', 'doc4', 'Tessellate seed memo'), src('deal', 'd4', 'Tessellate Energy')],
      actions: [{ kind: 'tasks', label: 'Create review tasks', desc: 'Questions for Victor Lang', tasks: [{ title: 'Send model questions to Victor Lang', related: 'Tessellate Energy', due: 'Oct 23' }] }],
    };
  }

  if (key === 'intel') {
    const item = DEMO_INTEL.find((entry) => entry.id === ref) ?? DEMO_INTEL[0];
    if (!item) return generic();
    return {
      bottomLine: item.why,
      lead: `"${item.headline}" matters to you because it touches ${item.topic}. ${item.why}`,
      bullets: [`Source: ${item.source}, ${item.date} — illustrative content in this prototype.`, `Linked to: ${item.topic}.`, 'Consider sharing with the record owner.'],
      reasoning: 'Matched by entities in the article and records you own or follow.',
      sources: [src(item.rk, item.rid, item.topic)],
      actions: [],
    };
  }

  if (key === 'module') {
    const moduleId = ref && isModuleId(ref) ? ref : null;
    const module = moduleId ? MODULES[moduleId] : null;
    let title = ref ?? '';
    for (const group of NAV_GROUPS) for (const item of group.items) if (item.id === ref) title = item.label;
    const phase = module && module.phase > 0 ? ROADMAP_PHASES[module.phase - 1] : null;
    return {
      bottomLine: module?.phase ? `${title} is planned for Phase ${module.phase}.` : `${title} is available now.`,
      lead: `The ${title} module is planned for ${phase ? `Phase ${module?.phase} (${phase.name})` : 'a later phase'} of the RedSky roadmap. ${module?.desc ?? ''}`,
      bullets: [...(module?.caps ?? [])],
      reasoning: 'From the RedSky architecture and roadmap. Timelines are planning estimates.',
      sources: [],
      actions: [],
    };
  }

  if (key === 'research') {
    return {
      bottomLine: 'Research brief started.',
      lead: `Research brief started for "${ref ?? 'your topic'}". In production, RedSky AI compiles internal records first, then approved external sources, and cites every finding.`,
      bullets: ['Internal: relationships, deals, documents and meeting notes that mention it.', 'External: connected providers only (AlphaSense and others require administrator setup).', 'Output: a cited brief saved to Documents.'],
      reasoning: 'Simulated in this prototype — no external sources were queried.',
      sources: [],
      actions: [{ kind: 'doc', label: 'Create the brief document', desc: 'Draft visible only to you' }],
    };
  }

  return generic();
}

function generic(): AiAnswer {
  return {
    bottomLine: 'This is a simulated prototype response.',
    lead: 'In this prototype, RedSky AI answers a set of sample questions using illustrative data. Try one of the suggested questions — in production, RedSky would search the records you’re authorized to access and cite every source.',
    bullets: SUGGESTED_PROMPTS.slice(0, 3).map((prompt) => prompt.q),
    sources: [],
    actions: [],
  };
}
