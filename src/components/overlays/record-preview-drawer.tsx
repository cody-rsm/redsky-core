'use client';

import { useQuery } from '@tanstack/react-query';
import { useRouter } from 'next/navigation';
import { Avatar } from '@/components/ui/avatar';
import { Drawer, DialogTitle } from '@/components/ui/dialog';
import { Icon, type IconName } from '@/components/ui/icon';
import type { RecordAction, RecordPreview } from '@/lib/api/contracts';
import { apiFetch } from '@/lib/client/api';
import { queryKeys } from '@/lib/client/query-client';
import { useUiStore, type PreviewTarget } from '@/lib/client/ui-store';
import { useViewer } from '@/lib/client/viewer';
import { useWorkspaceActions } from '@/lib/client/workspace-actions';

const KIND_LABEL: Record<string, string> = { contact: 'Person', company: 'Company', deal: 'Opportunity', project: 'Project', doc: 'Document' };

export function RecordPreviewDrawer() {
  const target = useUiStore((state) => state.preview);
  const close = useUiStore((state) => state.closePreview);
  return (
    <Drawer open={Boolean(target)} onOpenChange={(open) => !open && close()} label="Record preview">
      {target ? <PreviewBody key={`${target.kind}:${target.id}`} target={target} onClose={close} /> : null}
    </Drawer>
  );
}

type ActionButton = { key: RecordAction; label: string; icon: IconName; variant: '' | 'btn-ai' | 'btn-p'; run: () => void };

function PreviewBody({ target, onClose }: { target: PreviewTarget; onClose: () => void }) {
  const viewer = useViewer();
  const router = useRouter();
  const { data, isLoading } = useQuery({ queryKey: queryKeys.record(target.kind, target.id), queryFn: () => apiFetch<RecordPreview>(`/api/records/${target.kind}/${encodeURIComponent(target.id)}`), retry: false });
  const { openPreview, openPrep, openCreate, askAi, toast } = useUiStore.getState();
  const { approve } = useWorkspaceActions();
  const simulated = viewer.config.dataMode === 'demo';

  if (isLoading) {
    return (
      <div className="db" aria-busy="true">
        <span className="sk-load" style={{ width: '30%', height: 10 }} />
        <span className="sk-load" style={{ width: '70%', height: 26 }} />
        <span className="sk-load" style={{ width: '100%', height: 90 }} />
      </div>
    );
  }
  if (!data) {
    return (
      <>
        <header className="dh" style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <DialogTitle className="grow lbl">{KIND_LABEL[target.kind] ?? 'Record'}</DialogTitle>
          <button type="button" className="btn btn-g btn-sm btn-i" aria-label="Close" onClick={onClose}>
            <Icon name="x" size="s" />
          </button>
        </header>
        <div className="db">
          <div className="empty">
            <span className="tile">
              <Icon name="lock" />
            </span>
            <div style={{ fontWeight: 600, color: 'var(--tx)' }}>This record isn’t available</div>
            <div style={{ fontSize: 12.5, maxWidth: 320 }}>It may not exist, its source may not be connected yet, or you may not have access to it.</div>
          </div>
        </div>
      </>
    );
  }

  const ask = (key: keyof RecordPreview['asks']) => {
    const request = data.asks[key];
    onClose();
    if (request) void askAi(request.question, { key: request.key, ref: request.ref ?? null });
  };
  const ACTIONS: Record<RecordAction, Omit<ActionButton, 'key'>> = {
    draft_note: { label: 'Draft note', icon: 'ai', variant: 'btn-ai', run: () => ask('draft_note') },
    log_interaction: { label: 'Log interaction', icon: 'calendar', variant: '', run: () => openCreate('meeting', { related: data.org ?? '', extra: 'Today' }) },
    create_task: { label: 'Create task', icon: 'tasks', variant: '', run: () => openCreate('task', { title: data.kind === 'contact' ? `Follow up with ${data.title}` : '', related: data.org ?? data.title, extra: 'This week' }) },
    approve: { label: 'Approve IC date', icon: 'check', variant: 'btn-p', run: () => data.approval && approve(data.approval) },
    ask: { label: 'Ask RedSky', icon: 'ai', variant: 'btn-ai', run: () => ask('ask') },
    open_pipeline: { label: 'Open pipeline', icon: 'pipeline', variant: '', run: () => (onClose(), router.push('/pipeline')) },
    summarize: { label: 'Summarize with AI', icon: 'ai', variant: 'btn-ai', run: () => ask('summarize') },
    open_external: { label: 'Open in SharePoint', icon: 'arrowUR', variant: '', run: () => toast(simulated ? 'Opens in SharePoint (simulated)' : 'SharePoint is not connected yet') },
    message: { label: 'Message', icon: 'mail', variant: '', run: () => (onClose(), toast(simulated ? 'Opening Teams chat (simulated)' : 'Microsoft Teams is not connected yet')) },
    summarize_week: { label: 'Summarize this week', icon: 'ai', variant: 'btn-ai', run: () => ask('summarize_week') },
    research: { label: 'Research with AI', icon: 'ai', variant: 'btn-ai', run: () => ask('research') },
  };
  const actions: ActionButton[] = data.actions.map((key) => ({ key, ...ACTIONS[key] }));

  return (
    <>
      <header className="dh">
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <span className="lbl">{data.kindLabel}</span>
          {data.sample ? <span className="chip chip-o">Sample record</span> : null}
          <div className="grow" />
          <button type="button" className="btn btn-g btn-sm btn-i" aria-label="Close" onClick={onClose}>
            <Icon name="x" size="s" />
          </button>
        </div>
        <div style={{ display: 'flex', gap: 14, alignItems: 'center', marginTop: 12 }}>
          {data.avatar ? (
            <Avatar initials={data.avatar.initials} tone={data.avatar.tone} size="lg" style={{ width: 48, height: 48, fontSize: 16 }} />
          ) : (
            <span className="tile" style={{ width: 48, height: 48, borderRadius: 12 }}>
              <Icon name={data.icon} size="l" />
            </span>
          )}
          <div className="grow">
            <DialogTitle className="serif" style={{ fontSize: 25, lineHeight: 1.15 }}>
              {data.title}
            </DialogTitle>
            <div className="muted" style={{ fontSize: 13, marginTop: 3 }}>
              {data.subtitle}
            </div>
          </div>
        </div>
      </header>
      <div className="db scroll">
        <dl className="kv" style={{ fontSize: 13, gap: '9px 18px' }}>
          {data.fields.map((field) => (
            <div key={field.label} style={{ display: 'contents' }}>
              <dt>{field.label}</dt>
              <dd>{field.value}</dd>
            </div>
          ))}
        </dl>
        {data.stages ? (
          <section>
            <h3 className="sh">Stage</h3>
            <div className="steps" style={{ gridTemplateColumns: `repeat(${data.stages.length},minmax(0,1fr))` }}>
              {data.stages.map((stage) => (
                <div key={stage.label} className="stp" data-s={stage.state}>
                  <span className="stp-d" />
                  <span className="stp-l" title={stage.label}>
                    {stage.label}
                  </span>
                </div>
              ))}
            </div>
          </section>
        ) : null}
        {data.progress !== null ? (
          <section>
            <h3 className="sh">
              Progress
              <span className="faint num" style={{ marginLeft: 'auto', fontWeight: 500 }}>
                {data.progress}% complete
              </span>
            </h3>
            <span className="bar" style={{ height: 6 }}>
              <span style={{ width: `${data.progress}%` }} />
            </span>
          </section>
        ) : null}
        {data.openCommitment ? (
          <section>
            <h3 className="sh">
              Open commitment<span className="rec-tag" style={{ marginLeft: 'auto' }}>Recorded</span>
            </h3>
            <p style={{ fontSize: 13, lineHeight: 1.5 }}>{data.openCommitment}</p>
          </section>
        ) : null}
        {data.aiSuggestion ? (
          <section>
            <div className="ai-box" style={{ padding: '12px 14px' }}>
              <span className="ai-tag" style={{ display: 'flex', marginBottom: 4 }}>
                <Icon name="ai" size="xs" />
                Suggested next step
              </span>
              <span style={{ fontSize: 13 }}>{data.aiSuggestion}</span>
            </div>
          </section>
        ) : null}
        {data.activity.length > 0 ? (
          <section>
            <h3 className="sh">
              Recent activity<span className="rec-tag" style={{ marginLeft: 'auto' }}>Recorded</span>
            </h3>
            <div style={{ display: 'flex', flexDirection: 'column', borderLeft: '1px solid var(--bd)', marginLeft: 5 }}>
              {data.activity.map((entry) => (
                <div key={`${entry.date}-${entry.text}`} style={{ position: 'relative', padding: '0 0 12px 16px' }}>
                  <span style={{ position: 'absolute', left: -4, top: 5, width: 7, height: 7, borderRadius: '50%', background: 'var(--bd2)' }} />
                  <div className="faint num" style={{ fontSize: 11.5 }}>
                    {entry.date}
                  </div>
                  <div style={{ fontSize: 13, lineHeight: 1.45 }}>{entry.text}</div>
                </div>
              ))}
            </div>
          </section>
        ) : null}
        {data.related.length > 0 ? (
          <section>
            <h3 className="sh">Related</h3>
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
              {data.related.map((related) => (
                <button key={`${related.kind}:${related.id}`} type="button" className="src" onClick={() => (related.kind === 'meeting' ? openPrep(related.meetingId ?? related.id) : openPreview({ kind: related.kind, id: related.id }))}>
                  <Icon name={related.icon} size="xs" />
                  {related.label}
                </button>
              ))}
            </div>
          </section>
        ) : null}
        <div className="faint" style={{ fontSize: 11.5, display: 'flex', gap: 6, alignItems: 'center' }}>
          <Icon name="lock" size="xs" />
          Visible to you under your current permissions · {data.access}
        </div>
      </div>
      {actions.length > 0 ? (
        <footer className="df">
          {actions.map((action) => (
            <button key={action.key} type="button" className={`btn ${action.variant}`} onClick={action.run}>
              <Icon name={action.icon} size="s" />
              {action.label}
            </button>
          ))}
        </footer>
      ) : null}
    </>
  );
}
