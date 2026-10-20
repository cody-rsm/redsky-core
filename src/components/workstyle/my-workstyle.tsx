'use client';

import { useState } from 'react';
import { Icon } from '@/components/ui/icon';
import { Switch } from '@/components/ui/switch';
import { WS_FUTURE } from '@/features/workstyle/catalog';
import type { WorkstyleDetail } from '@/lib/api/contracts';
import { useUiStore } from '@/lib/client/ui-store';
import { useViewer } from '@/lib/client/viewer';
import { useWorkstyle, useWorkstyleActions } from '@/lib/client/workstyle';
import { ConsentCheckbox, ProcessingCard, ReportDrop, validateReportFile } from './intake';
import { ProfileCompact } from './profile-summary';
import { RecommendationRow, recommendationPairs } from './recommendations';
import { ReviewForm } from './review-form';
import { WorkstyleStorageNote, sourceLabel } from './workstyle-notes';

export function MyWorkstyle() {
  const viewer = useViewer();
  const query = useWorkstyle(viewer.config.workstyleStorageAvailable);
  const actions = useWorkstyleActions();
  const [consent, setConsent] = useState(false);
  const [uploading, setUploading] = useState<string | null>(null);
  const [editing, setEditing] = useState(false);
  const demo = viewer.config.dataMode === 'demo';

  const upload = (file: File) => {
    setUploading(file.name);
    actions.upload.mutate({ file, consent: true }, { onSettled: () => setUploading(null), onSuccess: () => setEditing(false) });
  };

  const header = (
    <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap', padding: '14px 0 4px' }}>
      <span className="chip chip-ai">
        <Icon name="ai" size="xs" />
        RedSky Workstyle Intelligence
      </span>
      <span className="chip chip-o">
        <Icon name="lock" size="xs" />
        Only you can see this
      </span>
    </div>
  );

  if (!viewer.config.workstyleStorageAvailable) {
    return (
      <>
        {header}
        <WorkstyleStorageNote />
      </>
    );
  }
  if (uploading) {
    return (
      <>
        {header}
        <div style={{ marginTop: 12 }}>
          <ProcessingCard fileName={uploading} compact />
        </div>
      </>
    );
  }
  if (query.isPending) {
    return (
      <>
        {header}
        <div className="wstate" role="status">
          <span className="sk-load" style={{ width: '60%', height: 10 }} />
          <span className="sk-load" style={{ width: '40%', height: 10 }} />
          <span className="sr-only">Loading your workstyle</span>
        </div>
      </>
    );
  }
  if (query.isError) {
    return (
      <>
        {header}
        <div className="wstate" role="alert">
          <b>Couldn’t load your workstyle</b>
          <span>{query.error.message}</span>
          <button type="button" className="btn btn-sm" onClick={() => query.refetch()}>
            Try again
          </button>
        </div>
      </>
    );
  }

  const detail = query.data;
  if (!detail.present) {
    return (
      <>
        {header}
        <p className="muted" style={{ fontSize: 13, lineHeight: 1.55, margin: '8px 0 14px' }}>
          Add your TTI Talent Insights report and RedSky will suggest ways to set up your workspace. It’s optional, private to you, and you decide what to keep.
        </p>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
          <ConsentCheckbox checked={consent} onChange={setConsent} compact />
          <ReportDrop consent={consent} onFile={upload} small />
          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
            {demo ? (
              <button type="button" className="btn btn-sm btn-ai" disabled={actions.startSample.isPending} onClick={() => actions.startSample.mutate(true)}>
                <Icon name="ai" size="s" />
                Preview with a sample assessment
              </button>
            ) : null}
            <button type="button" className="btn btn-sm" disabled={!consent || actions.startManual.isPending} onClick={() => actions.startManual.mutate(true)}>
              <Icon name="edit" size="s" />
              Enter scores manually
            </button>
          </div>
        </div>
      </>
    );
  }

  if (!detail.profile || editing) {
    return (
      <>
        {header}
        <SourceRow detail={detail} onReplace={upload} />
        <ReviewForm
          key={detail.addedAt ?? 'draft'}
          detail={detail}
          compact
          onCancel={editing ? () => setEditing(false) : undefined}
        />
        {!detail.profile ? <RemoveAssessment detail={detail} /> : null}
      </>
    );
  }

  return (
    <>
      {header}
      <SourceRow detail={detail} onReplace={upload} onEdit={() => setEditing(true)} />
      <ProfileCompact profile={detail.profile} />
      <div className="lbl" style={{ padding: '10px 0 2px' }}>
        Your recommendations
      </div>
      <p className="faint" style={{ fontSize: 12, marginBottom: 4 }}>
        Override any of them. Turning one off restores the setting you had before.
      </p>
      {recommendationPairs(detail.recommendations).map(({ definition, state }) => (
        <RecommendationRow key={definition.id} definition={definition} state={state} />
      ))}
      <SharingSection detail={detail} />
      <div className="lbl" style={{ padding: '18px 0 8px' }}>
        Coming later · always opt-in
      </div>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit,minmax(min(230px,100%),1fr))', gap: 8 }}>
        {WS_FUTURE.map((item) => (
          <div key={item.label} style={{ border: '1px solid var(--bd)', borderRadius: 10, padding: 12, display: 'flex', flexDirection: 'column', gap: 6 }}>
            <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
              <Icon name={item.icon} size="s" className="faint" />
              <span className="grow" style={{ fontWeight: 500, fontSize: 12.5 }}>
                {item.label}
              </span>
              <span className="chip chip-o" style={{ height: 18, fontSize: 10 }}>
                Planned
              </span>
            </div>
            <span className="faint" style={{ fontSize: 12, lineHeight: 1.45 }}>
              {item.desc}
            </span>
          </div>
        ))}
      </div>
      <div className="note" style={{ marginTop: 16, fontSize: 12 }}>
        <Icon name="shield" size="s" style={{ marginTop: 1, color: 'var(--ok)' }} />
        <span>Workstyle data is never used for ranking, performance evaluation, hiring or employment decisions. It informs suggestions — you always choose the final configuration.</span>
      </div>
      <RemoveAssessment detail={detail} />
    </>
  );
}

function SourceRow({ detail, onReplace, onEdit }: { detail: WorkstyleDetail; onReplace: (file: File) => void; onEdit?: () => void }) {
  const toast = useUiStore((state) => state.toast);
  const added = detail.addedAt ? new Date(detail.addedAt).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' }) : null;
  return (
    <div className="setrow" style={{ gap: 12 }}>
      <span className="tile">
        <Icon name={detail.sourceKind === 'manual' ? 'edit' : 'doc'} />
      </span>
      <div className="grow" style={{ minWidth: 0 }}>
        <div className="ell" style={{ fontWeight: 500 }}>
          {detail.fileName ?? 'Scores entered manually'}
        </div>
        <div className="faint" style={{ fontSize: 12 }}>
          {[added ? `Added ${added}` : null, sourceLabel(detail), 'private to you'].filter(Boolean).join(' · ')}
        </div>
      </div>
      {onEdit ? (
        <button type="button" className="btn btn-sm btn-g" onClick={onEdit}>
          <Icon name="edit" size="s" />
          Edit scores
        </button>
      ) : null}
      <label className="btn btn-sm" style={{ position: 'relative', overflow: 'hidden' }}>
        <Icon name="upload" size="s" />
        Update
        <input
          type="file"
          accept="application/pdf,.pdf"
          aria-label="Upload an updated assessment"
          style={{ position: 'absolute', inset: 0, opacity: 0, cursor: 'pointer' }}
          onChange={(event) => {
            const file = event.target.files?.[0];
            event.target.value = '';
            if (!file) return;
            const problem = validateReportFile(file);
            if (problem) toast(problem);
            else onReplace(file);
          }}
        />
      </label>
    </div>
  );
}

function SharingSection({ detail }: { detail: WorkstyleDetail }) {
  const { share } = useWorkstyleActions();
  const requestConfirm = useUiStore((state) => state.requestConfirm);

  const toggle = (scope: 'manager' | 'colleagues', label: string, item: string) => {
    if (detail.sharing[scope]) {
      share.mutate({ scope, enabled: false });
      return;
    }
    requestConfirm({
      title: `Share ${label}?`,
      body: 'Only the summary below is shared — never your full report, scores or Driving Forces. You can turn this off at any time, and it is never used for evaluation or employment decisions.',
      items: [item],
      ok: 'I consent — share',
      run: async () => {
        await share.mutateAsync({ scope, enabled: true });
      },
    });
  };

  return (
    <>
      <div className="lbl" style={{ padding: '18px 0 2px' }}>
        Sharing · off by default
      </div>
      <div className="setrow">
        <div className="grow">
          <div style={{ fontWeight: 500 }}>Share a summary with my manager</div>
          <div className="faint" style={{ fontSize: 12 }}>
            Communication and meeting preferences only — never scores or the full report. Your consent is recorded now; the manager view arrives in a later release.
          </div>
        </div>
        <Switch
          checked={detail.sharing.manager}
          label="Share a summary with my manager"
          disabled={share.isPending}
          onCheckedChange={() => toggle('manager', 'a summary with your manager', 'A short summary of your communication and meeting preferences, visible to your manager')}
        />
      </div>
      <div className="setrow">
        <div className="grow">
          <div style={{ fontWeight: 500 }}>Show my communication preferences to colleagues</div>
          <div className="faint" style={{ fontSize: 12 }}>
            Visible only to colleagues who also opt in, once colleague views are available
          </div>
        </div>
        <Switch
          checked={detail.sharing.colleagues}
          label="Show my communication preferences to colleagues"
          disabled={share.isPending}
          onCheckedChange={() => toggle('colleagues', 'your communication preferences with colleagues', 'Your communication preferences, visible to colleagues who also opt in')}
        />
      </div>
    </>
  );
}

function RemoveAssessment({ detail }: { detail: WorkstyleDetail }) {
  const { remove } = useWorkstyleActions();
  const requestConfirm = useUiStore((state) => state.requestConfirm);
  return (
    <div style={{ display: 'flex', gap: 8, marginTop: 14, flexWrap: 'wrap', alignItems: 'center' }}>
      <button
        type="button"
        className="btn btn-sm"
        style={{ color: 'var(--act)' }}
        onClick={() =>
          requestConfirm({
            title: 'Remove your assessment data?',
            body: 'Your uploaded report and extracted insights are permanently deleted. Your current RedSky settings stay exactly as they are.',
            items: [detail.fileName ?? 'Assessment scores'],
            ok: 'Remove data',
            run: async () => {
              await remove.mutateAsync();
            },
          })
        }
      >
        <Icon name="x" size="s" />
        Remove assessment data
      </button>
      <span className="faint" style={{ fontSize: 11.5 }}>
        Deletes the report and insights; keeps your current settings.
      </span>
    </div>
  );
}
