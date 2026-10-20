'use client';

import { useRouter } from 'next/navigation';
import { Avatar, normalizeTone } from '@/components/ui/avatar';
import { Icon } from '@/components/ui/icon';
import type { MeetingsData } from '@/lib/api/contracts';
import { useUiStore } from '@/lib/client/ui-store';
import { useWidget } from '@/lib/client/use-widget';
import { useWorkspaceActions } from '@/lib/client/workspace-actions';
import { WidgetFrame, type WidgetSlot } from '../widget-frame';
import { WidgetBody } from '../widget-states';

function startsIn(startMinutes: number, nowMinutes: number): string {
  const delta = startMinutes - nowMinutes;
  if (delta <= 0) return 'now';
  if (delta < 60) return `in ${delta} min`;
  const hours = Math.floor(delta / 60);
  const minutes = delta % 60;
  return `in ${hours}h${minutes ? ` ${minutes}m` : ''}`;
}

export function MeetingsWidget({ slot }: { slot: WidgetSlot }) {
  const router = useRouter();
  const query = useWidget('meetings');
  const sub = query.data ? (query.data.status === 'ok' ? `${query.data.data.meetings.length} today` : 'Not connected') : undefined;
  return (
    <WidgetFrame slot={slot} sub={sub} more={{ label: 'Calendar', onClick: () => router.push('/m/calendar') }}>
      <WidgetBody query={query} rows={3}>
        {(data) => <MeetingCards data={data} limit={Math.max(slot.itemLimit, 3)} />}
      </WidgetBody>
    </WidgetFrame>
  );
}

function MeetingCards({ data, limit }: { data: MeetingsData; limit: number }) {
  const openPrep = useUiStore((state) => state.openPrep);
  const { openRecord } = useWorkspaceActions();
  const nextIndex = data.nowMinutes === null ? -1 : data.meetings.findIndex((meeting) => meeting.startMinutes > (data.nowMinutes ?? 0));
  if (data.meetings.length === 0) {
    return (
      <div className="wb">
        <div className="empty">No meetings on your calendar today.</div>
      </div>
    );
  }
  return (
    <div className="wb">
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill,minmax(min(260px,100%),1fr))', gap: 8, padding: '0 6px' }}>
        {data.meetings.slice(0, limit).map((meeting, index) => {
          const isNext = index === nextIndex;
          return (
            <article key={meeting.id} className="mtg" data-next={isNext}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
                <span className="num" style={{ fontWeight: 600 }}>
                  {meeting.time}
                </span>
                <span className="faint num" style={{ fontSize: 12 }}>
                  {meeting.duration}
                </span>
                {isNext && data.nowMinutes !== null ? <span className="chip chip-ac">Next · {startsIn(meeting.startMinutes, data.nowMinutes)}</span> : null}
                <div className="grow" />
                <span className={`status st-${meeting.prepTone}`}>
                  <span className="dot" />
                  {meeting.prepLabel}
                </span>
              </div>
              <div style={{ fontWeight: 500, marginTop: 6, lineHeight: 1.35 }}>{meeting.title}</div>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginTop: 8, fontSize: 12, color: 'var(--tx2)' }}>
                <div className="avs">
                  {meeting.attendees.map((person) => (
                    <Avatar key={person.name} initials={person.initials} tone={normalizeTone(person.tone)} size="sm" title={person.name} />
                  ))}
                </div>
                <span className="ell grow">
                  {meeting.attendees.map((person) => person.name).join(', ')}
                  {meeting.includesViewer ? ' + you' : ''}
                </span>
              </div>
              <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginTop: 8, flexWrap: 'wrap' }}>
                <span className="chip">
                  <Icon name="company" size="xs" />
                  {meeting.org}
                </span>
                {meeting.related ? (
                  <button type="button" className="chip chip-o" onClick={() => meeting.related && openRecord(meeting.related.kind, meeting.related.id)}>
                    <Icon name={meeting.related.kind === 'deal' ? 'pipeline' : 'folder'} size="xs" />
                    {meeting.related.label}
                  </button>
                ) : null}
              </div>
              <button type="button" className="btn btn-ai btn-sm" style={{ marginTop: 12, width: '100%' }} onClick={() => openPrep(meeting.id)}>
                <Icon name="ai" size="s" />
                Prepare with RedSky AI
              </button>
            </article>
          );
        })}
      </div>
    </div>
  );
}
