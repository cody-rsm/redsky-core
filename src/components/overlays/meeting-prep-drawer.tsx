'use client';

import { useQuery, useQueryClient } from '@tanstack/react-query';
import { Avatar } from '@/components/ui/avatar';
import { Drawer, DialogTitle } from '@/components/ui/dialog';
import { Icon } from '@/components/ui/icon';
import { PREP_FORMAT_LABELS } from '@/features/preferences/schema';
import type { MeetingPrep } from '@/lib/api/contracts';
import { ApiError, apiFetch } from '@/lib/client/api';
import { queryKeys } from '@/lib/client/query-client';
import { useUiStore } from '@/lib/client/ui-store';
import { useViewer } from '@/lib/client/viewer';
import { useWorkspaceActions } from '@/lib/client/workspace-actions';
import { cn } from '@/lib/utils/cn';
import { strengthTone } from '@/components/dashboard/strength';

export function MeetingPrepDrawer() {
  const meetingId = useUiStore((state) => state.prepMeetingId);
  const close = useUiStore((state) => state.closePrep);
  return (
    <Drawer open={Boolean(meetingId)} onOpenChange={(open) => !open && close()} label="Meeting preparation" wide>
      {meetingId ? <PrepBody meetingId={meetingId} onClose={close} /> : null}
    </Drawer>
  );
}

function PrepBody({ meetingId, onClose }: { meetingId: string; onClose: () => void }) {
  const viewer = useViewer();
  const client = useQueryClient();
  const { data, isLoading, error } = useQuery({ queryKey: queryKeys.prep(meetingId), queryFn: () => apiFetch<MeetingPrep>(`/api/meetings/${encodeURIComponent(meetingId)}/prep`), retry: false });
  const { openPreview, askAi, toast, openSettings } = useUiStore.getState();
  const { proposeTasks, refreshWidgets } = useWorkspaceActions();
  const prepFormat = viewer.preferences.prepFormat;
  const onePage = prepFormat.startsWith('onepage');

  async function patch(body: { prepared?: boolean; followup?: { index: number; done: boolean } }) {
    client.setQueryData<MeetingPrep>(queryKeys.prep(meetingId), (current) => {
      if (!current) return current;
      const followups = body.followup ? current.followups.map((followup, index) => (index === body.followup?.index ? { ...followup, done: body.followup.done } : followup)) : current.followups;
      const prepared = body.prepared ?? current.prepared;
      return { ...current, prepared, followups, meeting: { ...current.meeting, prepLabel: prepared ? 'Prepared' : current.meeting.prepLabel, prepTone: prepared ? 'ok' : current.meeting.prepTone } };
    });
    await apiFetch(`/api/meetings/${encodeURIComponent(meetingId)}/prep`, { method: 'PATCH', body });
    await refreshWidgets();
  }

  if (isLoading) {
    return (
      <div className="db" aria-busy="true">
        <span className="sk-load" style={{ width: '40%', height: 12 }} />
        <span className="sk-load" style={{ width: '80%', height: 24 }} />
        <span className="sk-load" style={{ width: '100%', height: 80 }} />
      </div>
    );
  }
  if (!data) {
    const notConnected = error instanceof ApiError && error.status === 404;
    return (
      <>
        <header className="dh" style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <DialogTitle className="grow" style={{ fontSize: 15, fontWeight: 600 }}>
            Meeting preparation
          </DialogTitle>
          <button type="button" className="btn btn-g btn-sm btn-i" aria-label="Close" onClick={onClose}>
            <Icon name="x" size="s" />
          </button>
        </header>
        <div className="db">
          <div className="empty">
            <span className="lt lt-0">Ca</span>
            <div style={{ fontWeight: 600, color: 'var(--tx)' }}>{notConnected ? 'This meeting isn’t available' : 'Couldn’t load this brief'}</div>
            <div style={{ fontSize: 12.5, maxWidth: 320 }}>{notConnected ? 'Meeting briefs need Outlook Calendar, which is not connected yet.' : 'Please try again in a moment.'}</div>
          </div>
        </div>
      </>
    );
  }

  const { meeting } = data;
  const history = onePage ? data.history.slice(0, 2) : data.history;
  const openFollowups = data.followups;

  return (
    <>
      <header className="dh">
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
          <span className="chip chip-ai">
            <Icon name="ai" size="xs" />
            {viewer.config.aiSimulated ? 'Prepared by RedSky AI · simulated' : 'Prepared by RedSky AI'}
          </span>
          {prepFormat !== 'standard' ? (
            <button type="button" className="chip chip-o" onClick={() => openSettings('workstyle')} title="Change in Settings › My Workstyle">
              <Icon name="compass" size="xs" />
              {PREP_FORMAT_LABELS[prepFormat]} · from your workstyle
            </button>
          ) : null}
          <span className="faint num" style={{ fontSize: 12 }}>
            Today · {meeting.time} · {meeting.duration} · {meeting.where}
          </span>
          <div className="grow" />
          <button type="button" className="btn btn-g btn-sm btn-i" aria-label="Close" onClick={onClose}>
            <Icon name="x" size="s" />
          </button>
        </div>
        <DialogTitle className="serif" style={{ fontSize: 27, lineHeight: 1.15, margin: '12px 0 6px' }}>
          {meeting.title}
        </DialogTitle>
        <div className="muted" style={{ fontSize: 13, display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center' }}>
          <Icon name="company" size="s" />
          {meeting.org}
          {meeting.related ? (
            <>
              <span aria-hidden="true">·</span>
              <button type="button" className="rel" onClick={() => meeting.related && openPreview({ kind: meeting.related.kind, id: meeting.related.id })}>
                {meeting.related.label}
              </button>
            </>
          ) : null}
          <span aria-hidden="true">·</span>
          <span className={`status st-${meeting.prepTone}`}>
            <span className="dot" />
            {meeting.prepLabel}
          </span>
        </div>
      </header>
      <div className="db scroll">
        {data.isPublicOfficial ? (
          <div className="note note-wn">
            <Icon name="shield" size="s" style={{ marginTop: 1, color: 'var(--wn)' }} />
            <span>Public official attending. This interaction may be subject to lobbying-disclosure and gift rules — RedSky will prompt you to log it afterwards.</span>
          </div>
        ) : null}
        <section>
          <h3 className="sh">
            <span className="ai-tag">
              <Icon name="ai" size="xs" />
              AI summary
            </span>
          </h3>
          <div className="ai-box" style={{ fontSize: 13.5, lineHeight: 1.6, padding: '12px 14px' }}>
            {data.summary}
          </div>
        </section>
        <section>
          <h3 className="sh">
            Participants<span className="rec-tag" style={{ marginLeft: 'auto' }}>Recorded</span>
          </h3>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill,minmax(min(220px,100%),1fr))', gap: 8 }}>
            {data.participants.map((person) => (
              <div key={person.id} className="rc" style={{ gap: 8, padding: 12 }}>
                <div style={{ display: 'flex', gap: 10, alignItems: 'center' }}>
                  <Avatar initials={person.initials} tone={person.tone} size="lg" />
                  <div className="grow">
                    <button type="button" className="rel" onClick={() => openPreview({ kind: 'contact', id: person.id })}>
                      {person.name}
                    </button>
                    <div className="faint ell" style={{ fontSize: 11.5, marginTop: 2 }}>
                      {person.title}
                    </div>
                    <div className="faint ell" style={{ fontSize: 11.5 }}>
                      {person.org}
                    </div>
                  </div>
                </div>
                <div style={{ display: 'flex', gap: 6, alignItems: 'center', flexWrap: 'wrap' }}>
                  <span className={cn('chip', strengthTone(person.strength))}>{person.strength}</span>
                  <span className="faint ell" style={{ fontSize: 11.5 }}>
                    {person.last}
                  </span>
                </div>
              </div>
            ))}
          </div>
        </section>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit,minmax(min(300px,100%),1fr))', gap: 22 }}>
          <section>
            <h3 className="sh">
              Relationship history<span className="rec-tag" style={{ marginLeft: 'auto' }}>Recorded</span>
            </h3>
            <div style={{ display: 'flex', flexDirection: 'column', borderLeft: '1px solid var(--bd)', marginLeft: 5 }}>
              {history.map((entry) => (
                <div key={`${entry.date}-${entry.text}`} style={{ position: 'relative', padding: '0 0 14px 16px' }}>
                  <span style={{ position: 'absolute', left: -4, top: 5, width: 7, height: 7, borderRadius: '50%', background: 'var(--bd2)' }} />
                  <div className="faint num" style={{ fontSize: 11.5 }}>
                    {entry.date}
                  </div>
                  <div style={{ fontSize: 13, lineHeight: 1.45 }}>{entry.text}</div>
                  <div className="faint" style={{ fontSize: 11.5 }}>
                    {entry.by}
                  </div>
                </div>
              ))}
            </div>
          </section>
          <section>
            <h3 className="sh">
              Related documents<span className="rec-tag" style={{ marginLeft: 'auto' }}>Recorded</span>
            </h3>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
              {data.documents.map((doc) => (
                <button key={doc.id} type="button" className="mi" style={{ border: '1px solid var(--bd)', padding: '8px 10px' }} onClick={() => openPreview({ kind: 'doc', id: doc.id })}>
                  <Icon name="doc" size="s" className="faint" />
                  <span className="grow" style={{ display: 'flex', flexDirection: 'column', minWidth: 0 }}>
                    <span className="ell" style={{ fontSize: 12.5, fontWeight: 500 }}>
                      {doc.name}
                    </span>
                    <span className="faint ell" style={{ fontSize: 11.5 }}>
                      {doc.meta}
                    </span>
                  </span>
                </button>
              ))}
              {data.documents.length === 0 ? (
                <div className="faint" style={{ fontSize: 12.5 }}>
                  No linked documents.
                </div>
              ) : null}
            </div>
          </section>
        </div>
        {!onePage && data.developments.length > 0 ? (
          <section>
            <h3 className="sh">
              Recent relevant developments
              <span className="chip chip-o" style={{ marginLeft: 'auto' }}>
                Illustrative
              </span>
            </h3>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
              {data.developments.map((development) => (
                <div key={development} style={{ display: 'flex', gap: 10, fontSize: 13, lineHeight: 1.45 }}>
                  <Icon name="globe" size="s" className="faint" style={{ marginTop: 2 }} />
                  <span>{development}</span>
                </div>
              ))}
            </div>
          </section>
        ) : null}
        <section>
          <h3 className="sh">
            Suggested discussion topics
            <span className="ai-tag" style={{ marginLeft: 'auto' }}>
              <Icon name="ai" size="xs" />
              AI suggested
            </span>
          </h3>
          <ol style={{ margin: 0, padding: 0, listStyle: 'none', display: 'flex', flexDirection: 'column', gap: 6 }}>
            {data.topics.map((topic, index) => (
              <li key={topic} className="ai-box" style={{ display: 'flex', gap: 10, fontSize: 13 }}>
                <span className="num" style={{ fontWeight: 600, color: 'var(--ai)' }}>
                  {index + 1}
                </span>
                <span>{topic}</span>
              </li>
            ))}
          </ol>
        </section>
        <section>
          <h3 className="sh">
            Outstanding follow-ups<span className="rec-tag" style={{ marginLeft: 'auto' }}>Recorded</span>
          </h3>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
            {openFollowups.map((followup, index) => (
              <div key={followup.text} className={cn('row', followup.done && 'done')} style={{ alignItems: 'center', padding: 8 }}>
                <button type="button" className="chk" role="checkbox" aria-checked={followup.done} aria-label={`Mark complete: ${followup.text}`} onClick={() => void patch({ followup: { index, done: !followup.done } })}>
                  <Icon name="check" size="xs" strokeWidth={2.6} />
                </button>
                <span className="grow ttl" style={{ fontSize: 13 }}>
                  {followup.text}
                </span>
                <span className="faint" style={{ fontSize: 12 }}>
                  {followup.who}
                </span>
                <span className={`due due-${followup.done ? 'tx' : followup.tone}`}>{followup.due}</span>
              </div>
            ))}
            {openFollowups.length === 0 ? (
              <div className="faint" style={{ fontSize: 12.5 }}>
                No open follow-ups.
              </div>
            ) : null}
          </div>
        </section>
      </div>
      <footer className="df">
        <button type="button" className="btn btn-ai" onClick={() => void askAi(`Prepare me for ${meeting.title}`, { key: 'next', ref: meetingId })}>
          <Icon name="ai" size="s" />
          Ask a follow-up
        </button>
        <button
          type="button"
          className="btn"
          disabled={openFollowups.length === 0}
          onClick={() => proposeTasks({ type: 'meeting_followups', meetingId }, openFollowups.map((followup) => `${followup.text} · ${/overdue/.test(followup.due) ? 'Today' : followup.due}`))}
        >
          <Icon name="plus" size="s" />
          Add follow-ups to My Tasks
        </button>
        <div className="grow" />
        <button
          type="button"
          className="btn btn-p"
          onClick={() => {
            const next = !data.prepared;
            void patch({ prepared: next });
            if (next) toast('Marked as prepared');
          }}
        >
          {data.prepared ? 'Prepared ✓' : 'Mark as prepared'}
        </button>
      </footer>
    </>
  );
}
