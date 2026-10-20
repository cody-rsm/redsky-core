'use client';

import { useState } from 'react';
import { Icon } from '@/components/ui/icon';
import { ConsentCheckbox, ProcessingCard, ReportDrop } from '@/components/workstyle/intake';
import { WorkstyleHomePreview } from '@/components/workstyle/home-preview';
import { ProfileOverview } from '@/components/workstyle/profile-summary';
import { RecommendationCard, recommendationPairs } from '@/components/workstyle/recommendations';
import { ReviewForm } from '@/components/workstyle/review-form';
import { WorkstyleStorageNote } from '@/components/workstyle/workstyle-notes';
import { WS_EXTRACTION_ITEMS, WS_PROMISES, WS_RECOMMENDATION_IDS } from '@/features/workstyle/catalog';
import type { WorkstyleDetail } from '@/lib/api/contracts';
import { useUiStore } from '@/lib/client/ui-store';
import { useViewer } from '@/lib/client/viewer';
import { useWorkstyle, useWorkstyleActions } from '@/lib/client/workstyle';

export function WorkstyleStep() {
  const viewer = useViewer();
  const available = viewer.config.workstyleStorageAvailable;
  const query = useWorkstyle(available);
  const actions = useWorkstyleActions();
  const requestConfirm = useUiStore((state) => state.requestConfirm);
  const [consent, setConsent] = useState(false);
  const [uploading, setUploading] = useState<string | null>(null);
  const demo = viewer.config.dataMode === 'demo';

  const upload = (file: File) => {
    setUploading(file.name);
    actions.upload.mutate({ file, consent: true }, { onSettled: () => setUploading(null) });
  };

  const startOver = () =>
    requestConfirm({
      title: 'Start over?',
      body: 'The report and anything entered so far are deleted. Nothing has been applied to your settings yet.',
      items: [query.data?.fileName ?? 'Assessment scores'],
      ok: 'Delete and start over',
      run: async () => {
        await actions.remove.mutateAsync();
        setConsent(false);
      },
    });

  const header = (
    <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
      <span className="lbl">Step 4 · Workstyle</span>
      <span className="chip chip-ai">
        <Icon name="ai" size="xs" />
        RedSky Workstyle Intelligence
      </span>
      <span className="chip chip-o">Optional</span>
      <span className="chip chip-o">
        <Icon name="lock" size="xs" />
        Private to you
      </span>
    </div>
  );

  if (!available) {
    return (
      <div className="ob-inner a-in" style={{ maxWidth: 1160 }}>
        {header}
        <h1 className="ob-h serif">Personalize how you work</h1>
        <WorkstyleStorageNote />
      </div>
    );
  }

  if (uploading) {
    return (
      <div className="ob-inner a-in" style={{ maxWidth: 1160 }}>
        {header}
        <div className="a-in" style={{ maxWidth: 560, margin: '40px auto 0', display: 'flex', flexDirection: 'column', gap: 18 }}>
          <h1 className="ob-h serif" style={{ textAlign: 'center' }}>
            Reading your assessment…
          </h1>
          <ProcessingCard fileName={uploading} />
          <p className="faint" style={{ textAlign: 'center', fontSize: 12 }}>
            Your report is encrypted and visible only to you.
          </p>
        </div>
      </div>
    );
  }

  const detail = query.data;
  if (query.isPending || !detail) {
    return (
      <div className="ob-inner a-in" style={{ maxWidth: 1160 }}>
        {header}
        {query.isError ? (
          <div className="wstate" role="alert">
            <b>Couldn’t load your workstyle</b>
            <span>{query.error.message}</span>
            <button type="button" className="btn btn-sm" onClick={() => void query.refetch()}>
              Try again
            </button>
          </div>
        ) : (
          <div className="wstate" aria-busy="true">
            <span className="sk-load" style={{ width: '50%', height: 22 }} />
          </div>
        )}
      </div>
    );
  }

  if (!detail.present) {
    return (
      <div className="ob-inner a-in" style={{ maxWidth: 1160 }}>
        {header}
        <h1 className="ob-h serif">Personalize how you work</h1>
        <p className="ob-sub">
          Share your TTI Talent Insights report and RedSky will suggest how to set up your home page, meeting preparation, tasks and AI around the way you prefer to work. Every suggestion is yours to accept, adjust or dismiss.
        </p>
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 20, marginTop: 28, alignItems: 'flex-start' }}>
          <div style={{ flex: '999 1 460px', display: 'flex', flexDirection: 'column', gap: 12, minWidth: 0 }}>
            <ConsentCheckbox checked={consent} onChange={setConsent} />
            <ReportDrop consent={consent} onFile={upload} />
            <div style={{ display: 'flex', gap: 10, alignItems: 'center', flexWrap: 'wrap' }}>
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
              <span className="faint" style={{ fontSize: 12 }}>
                No report handy? Skip this step and add one later in Settings › My Workstyle.
              </span>
            </div>
          </div>
          <div style={{ flex: '1 1 320px', display: 'flex', flexDirection: 'column', gap: 12 }}>
            <div className="card" style={{ padding: '16px 18px' }}>
              <div className="lbl" style={{ marginBottom: 8 }}>
                What RedSky reads
              </div>
              {WS_EXTRACTION_ITEMS.map((item) => (
                <div key={item.label} style={{ display: 'flex', gap: 10, alignItems: 'center', padding: '6px 0', fontSize: 13 }}>
                  <Icon name={item.icon} size="s" className="faint" />
                  {item.label}
                </div>
              ))}
            </div>
            <div className="card" style={{ padding: '16px 18px' }}>
              <div style={{ display: 'flex', gap: 8, alignItems: 'center', marginBottom: 8 }}>
                <Icon name="shield" style={{ color: 'var(--ok)' }} />
                <span style={{ fontWeight: 600 }}>Your data, your control</span>
              </div>
              {WS_PROMISES.map((promise) => (
                <div key={promise} style={{ display: 'flex', gap: 8, alignItems: 'flex-start', padding: '5px 0', fontSize: 12.5, lineHeight: 1.45 }} className="muted">
                  <Icon name="check" size="xs" strokeWidth={2.4} style={{ color: 'var(--ok)', marginTop: 3 }} />
                  <span>{promise}</span>
                </div>
              ))}
              <p className="faint" style={{ fontSize: 11.5, marginTop: 8, lineHeight: 1.45 }}>
                Assessments describe tendencies, not fixed traits or predictions of performance.
              </p>
            </div>
          </div>
        </div>
      </div>
    );
  }

  if (!detail.profile) {
    return (
      <div className="ob-inner a-in" style={{ maxWidth: 860 }}>
        {header}
        <h1 className="ob-h serif">Check your scores</h1>
        <p className="ob-sub" style={{ marginBottom: 18 }}>
          {detail.fileName ? `From ${detail.fileName}. ` : ''}Nothing is used until you confirm these values — correct anything that doesn’t match your report.
        </p>
        <ReviewForm key={detail.addedAt ?? 'draft'} detail={detail} onCancel={startOver} />
      </div>
    );
  }

  return <WorkstyleResults detail={detail} />;
}

function WorkstyleResults({ detail }: { detail: WorkstyleDetail }) {
  const { change } = useWorkstyleActions();
  const toast = useUiStore((state) => state.toast);
  const profile = detail.profile;
  if (!profile) return null;
  const pairs = recommendationPairs(detail.recommendations);
  const accepted = detail.recommendations.filter((entry) => entry.status === 'accepted').length;
  const allDecided = detail.recommendations.every((entry) => entry.status !== 'pending');
  const source = detail.sourceKind === 'sample' ? 'Illustrative sample values.' : 'Values you reviewed.';
  return (
    <div className="ob-inner a-in" style={{ maxWidth: 1160 }}>
      <div className="a-in">
        <h1 className="serif" style={{ fontSize: 46, lineHeight: 1.06, margin: '16px 0 10px' }}>
          Your Workstyle. Your RedSky.
        </h1>
        <p className="ob-sub">
          Based on {detail.fileName ?? 'the scores you entered'}. These are suggestions drawn from tendencies in your report — keep what helps, adjust what doesn’t, and change your mind any time.
        </p>
        <ProfileOverview profile={profile} />
        <div className="note" style={{ marginTop: 10, fontSize: 11.5, padding: '7px 10px' }}>
          <Icon name="alert" size="xs" style={{ marginTop: 2 }} />
          <span>{source} Assessments describe tendencies, not fixed traits or predictions of performance.</span>
        </div>
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 20, marginTop: 26, alignItems: 'flex-start' }}>
          <div style={{ flex: '999 1 520px', display: 'flex', flexDirection: 'column', gap: 10, minWidth: 0 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
              <h2 className="qh" style={{ margin: 0 }}>
                Recommended for you
              </h2>
              <span className="chip">
                {accepted} of {WS_RECOMMENDATION_IDS.length} accepted
              </span>
              <div className="grow" />
              <button
                type="button"
                className="btn btn-sm"
                disabled={allDecided || change.isPending}
                onClick={() => change.mutate({ acceptAll: true }, { onSuccess: () => toast('Suggestions applied — you can change any of them later') })}
              >
                <Icon name="check" size="s" />
                Accept all
              </button>
            </div>
            {pairs.map(({ definition, state }) => (
              <RecommendationCard key={definition.id} definition={definition} state={state} />
            ))}
          </div>
          <div style={{ flex: '1 1 340px', position: 'sticky', top: 0 }}>
            <WorkstyleHomePreview detail={detail} />
          </div>
        </div>
        <div className="note" style={{ marginTop: 18 }}>
          <Icon name="shield" size="s" style={{ marginTop: 1, color: 'var(--ok)' }} />
          <span>
            You control the final configuration — the steps that follow let you change anything. Your assessment stays private to you, is never shared without your explicit consent, and is never used for ranking, performance evaluation, hiring or employment decisions. Review or
            remove it any time in Settings › My Workstyle.
          </span>
        </div>
      </div>
    </div>
  );
}
