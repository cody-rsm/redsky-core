import 'server-only';
import { DEMO_DOCS, DEMO_MEET, DEMO_MEET_BY, DEMO_PEOPLE, DEMO_PREP } from '@/demo/sample-records';
import type { DemoPrep } from '@/demo/types';
import type { MeetingPrep } from '@/lib/api/contracts';
import type { ProviderContext } from '../types';
import { chipFor, selfPersonId, stateOf } from './helpers';
import { demoMeetingView } from './demo-provider';

export function demoPrepSource(meetingId: string): DemoPrep | null {
  const meeting = DEMO_MEET[meetingId];
  if (!meeting) return null;
  return (
    DEMO_PREP[meetingId] ?? {
      summary: 'RedSky found limited history for this meeting. Review the agenda and related records below.',
      history: meeting.people.flatMap((personId) => {
        const person = DEMO_PEOPLE[personId];
        return person && !person.internal ? [{ d: 'Recent', t: person.last ?? 'Prior interaction', by: 'Recorded' }] : [];
      }),
      docs: [],
      dev: [],
      topics: ['Confirm decisions needed from this meeting.', 'Agree owners and next steps.'],
      followups: [],
    }
  );
}

export function demoMeetingPrep(meetingId: string, context: ProviderContext): MeetingPrep | null {
  if (!(DEMO_MEET_BY[context.persona] ?? []).includes(meetingId)) {
    // Meetings outside the persona's calendar are not visible to this viewer.
    const anyPersona = Object.values(DEMO_MEET_BY).some((ids) => ids.includes(meetingId));
    if (!anyPersona) return null;
  }
  const meeting = DEMO_MEET[meetingId];
  const view = demoMeetingView(meetingId, context);
  const source = demoPrepSource(meetingId);
  if (!meeting || !view || !source) return null;
  const state = stateOf(context, `meeting:${meetingId}`);
  const done = new Set(state.followupsDone ?? []);
  const self = selfPersonId(context);
  return {
    meeting: view,
    summary: source.summary,
    isPublicOfficial: Boolean(meeting.gov),
    participants: meeting.people
      .filter((personId) => personId !== self)
      .flatMap((personId) => {
        const person = DEMO_PEOPLE[personId];
        if (!person) return [];
        return [{ ...chipFor(person.name, person.tone), id: personId, title: person.title, org: person.org, strength: person.strength ?? 'Colleague', last: person.last ?? 'Internal' }];
      }),
    history: source.history.map((entry) => ({ date: entry.d, text: entry.t, by: entry.by.replace('Logged by you', `Logged by ${context.viewerName}`) })),
    documents: source.docs.flatMap((docId) => {
      const doc = DEMO_DOCS[docId];
      return doc ? [{ id: docId, name: doc.name, meta: doc.meta, kind: doc.kind }] : [];
    }),
    developments: source.dev,
    topics: source.topics,
    followups: source.followups.map((followup, index) => ({
      text: followup.t,
      who: followup.who === '@me' ? context.viewerName : followup.who,
      due: followup.due,
      tone: done.has(index) ? 'tx' : followup.tone,
      done: done.has(index),
    })),
    prepared: Boolean(state.prepared),
  };
}
