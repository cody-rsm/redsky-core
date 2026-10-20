'use client';

import { useIsMutating, useQueryClient } from '@tanstack/react-query';
import { useRouter } from 'next/navigation';
import { useRef, useState } from 'react';
import { Icon } from '@/components/ui/icon';
import { RedSkyMark } from '@/components/ui/redsky-mark';
import { landingHref } from '@/features/navigation/landing';
import { FOCUS_AREA_SHORT } from '@/features/personalization/catalog';
import { isSkippableStep, ONBOARDING_STEP_COUNT, ONBOARDING_STEPS, onboardingStepBlocker } from '@/features/onboarding/steps';
import type { ViewerPayload } from '@/lib/api/contracts';
import { apiFetch, errorMessage } from '@/lib/client/api';
import { queryKeys } from '@/lib/client/query-client';
import { useUiStore } from '@/lib/client/ui-store';
import { useThemeSync, useUpdatePreferences, useViewer } from '@/lib/client/viewer';
import { viewerDisplay } from '@/lib/client/viewer-display';
import { WORKSTYLE_UPLOAD_KEY } from '@/lib/client/workstyle';
import { AiStep } from './steps/ai-step';
import { ConnectStep } from './steps/connect-step';
import { HomeBuilderStep } from './steps/home-builder-step';
import { PreferencesStep } from './steps/preferences-step';
import { ProfileStep } from './steps/profile-step';
import { ReadyStep } from './steps/ready-step';
import { RoleStep } from './steps/role-step';
import { WelcomeStep } from './steps/welcome-step';
import { WorkstyleStep } from './steps/workstyle-step';

export type StepNavigation = { goTo: (index: number) => void; next: () => void };

export function OnboardingFlow({ stepIndex }: { stepIndex: number }) {
  const viewer = useViewer();
  const router = useRouter();
  const client = useQueryClient();
  const toast = useUiStore((state) => state.toast);
  const updatePreferences = useUpdatePreferences();
  const mainRef = useRef<HTMLElement>(null);
  const [moving, setMoving] = useState(false);
  const [entering, setEntering] = useState<number | null>(null);
  const uploading = useIsMutating({ mutationKey: WORKSTYLE_UPLOAD_KEY }) > 0;
  useThemeSync(viewer.preferences.theme);

  const { maxStep } = viewer.onboarding;
  const blocker = onboardingStepBlocker(stepIndex, { firstName: viewer.profile.firstName, focusAreaCount: viewer.profile.focusAreas.length });
  const dark = viewer.preferences.theme === 'dark';
  const themeLabel = dark ? 'Switch to light mode' : 'Switch to dark mode';

  async function goTo(index: number) {
    if (moving || index === stepIndex) return;
    setMoving(true);
    try {
      const progress = await apiFetch<{ currentStep: number; maxStep: number }>('/api/onboarding', { method: 'PUT', body: { step: index } });
      client.setQueryData<ViewerPayload>(queryKeys.viewer, (current) => (current ? { ...current, onboarding: { ...current.onboarding, ...progress } } : current));
      router.push(`/onboarding/${ONBOARDING_STEPS[index]?.slug ?? 'welcome'}`);
      mainRef.current?.scrollTo({ top: 0 });
    } catch (error) {
      toast(errorMessage(error));
    } finally {
      setMoving(false);
    }
  }

  async function enter() {
    if (moving) return;
    setMoving(true);
    try {
      await apiFetch('/api/onboarding/complete', { method: 'POST' });
    } catch (error) {
      toast(errorMessage(error));
      setMoving(false);
      return;
    }
    client.setQueryData<ViewerPayload>(queryKeys.viewer, (current) => (current ? { ...current, onboarding: { ...current.onboarding, completed: true } } : current));
    const name = viewerDisplay(viewer).greetingName;
    const destination = landingHref(viewer.preferences.landing);
    setEntering(0);
    [1, 2, 3, 4].forEach((step) => setTimeout(() => setEntering(step), step * 420));
    setTimeout(() => {
      router.replace(destination);
      toast(`Welcome to RedSky, ${name}. Your workspace is ready.`);
    }, 2000);
  }

  const next = () => {
    if (blocker || uploading) return;
    if (stepIndex >= ONBOARDING_STEP_COUNT - 1) return void enter();
    void goTo(stepIndex + 1);
  };
  const navigation: StepNavigation = { goTo: (index) => void goTo(index), next };

  if (entering !== null) return <EnteringScreen step={entering} />;

  const step = ONBOARDING_STEPS[stepIndex];
  const nextLabel = stepIndex === 7 ? 'Finish setup' : stepIndex === 8 ? 'Enter RedSky' : 'Continue';
  const canSkip = isSkippableStep(stepIndex) && !(stepIndex === 3 && viewer.workstyle.present);

  return (
    <div className="ob">
      <header className="ob-top">
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <RedSkyMark size={28} />
          <span className="serif" style={{ fontSize: 20, lineHeight: 1 }}>
            RedSky
          </span>
        </div>
        <span className="hide-sm" style={{ width: 1, height: 20, background: 'var(--bd)' }} />
        <span className="hide-sm faint" style={{ fontSize: 12.5 }}>
          Workspace setup
        </span>
        <div className="grow" />
        <span className="chip chip-o hide-sm">
          <Icon name="lock" size="xs" />
          Confidential · RSM Capital internal
        </span>
        <span className="faint num" style={{ fontSize: 12.5 }}>
          Step {stepIndex + 1} of {ONBOARDING_STEP_COUNT}
        </span>
        <button type="button" className="btn btn-g btn-sm btn-i" onClick={() => updatePreferences.mutate({ theme: dark ? 'light' : 'dark' })} aria-label={themeLabel} title={themeLabel}>
          <Icon name={dark ? 'sun' : 'moon'} />
        </button>
      </header>
      <div className="ob-prog" aria-hidden="true">
        <div style={{ width: `${Math.round(((stepIndex + 1) / ONBOARDING_STEP_COUNT) * 100)}%` }} />
      </div>
      <div className="ob-body">
        {stepIndex > 0 ? (
          <nav className="ob-steps" aria-label="Setup steps">
            <div className="lbl" style={{ padding: '0 10px 10px' }}>
              Set up RedSky
            </div>
            {ONBOARDING_STEPS.map((entry, index) => {
              const current = index === stepIndex;
              const done = index < maxStep && !current;
              return (
                <button key={entry.slug} type="button" className="ob-step" data-cur={current} data-done={done} disabled={index > maxStep} aria-current={current ? 'step' : undefined} onClick={() => void goTo(index)}>
                  <span className="ob-num">{done ? <Icon name="check" size="xs" strokeWidth={2.6} /> : index + 1}</span>
                  <span style={{ display: 'flex', flexDirection: 'column', lineHeight: 1.25, minWidth: 0 }}>
                    <span style={{ fontSize: 13, fontWeight: 500 }}>{entry.label}</span>
                    <span className="faint ell" style={{ fontSize: 11.5 }}>
                      {entry.hint}
                    </span>
                  </span>
                </button>
              );
            })}
            <div className="grow" />
            <div className="note" style={{ marginTop: 20, fontSize: 11.5 }}>
              <Icon name="shield" size="s" style={{ marginTop: 1 }} />
              <span>Your choices are saved as you go. You can change any of them later in Settings.</span>
            </div>
          </nav>
        ) : null}
        <main className="ob-main scroll" ref={mainRef}>
          {stepIndex === 0 ? <WelcomeStep navigation={navigation} /> : null}
          {stepIndex === 1 ? <ProfileStep /> : null}
          {stepIndex === 2 ? <RoleStep /> : null}
          {stepIndex === 3 ? <WorkstyleStep /> : null}
          {stepIndex === 4 ? <ConnectStep /> : null}
          {stepIndex === 5 ? <PreferencesStep /> : null}
          {stepIndex === 6 ? <AiStep /> : null}
          {stepIndex === 7 ? <HomeBuilderStep /> : null}
          {stepIndex === 8 ? <ReadyStep navigation={navigation} /> : null}
        </main>
      </div>
      {stepIndex > 0 ? (
        <footer className="ob-foot">
          <button type="button" className="btn" onClick={() => void goTo(stepIndex - 1)} disabled={moving}>
            <Icon name="chevL" />
            Back
          </button>
          <div className="grow faint hide-sm" style={{ fontSize: 12.5, paddingLeft: 6 }} role={blocker ? 'status' : undefined}>
            {blocker ?? step?.footHint}
          </div>
          {canSkip ? (
            <button type="button" className="btn btn-g" onClick={next} disabled={moving || uploading}>
              Skip for now
            </button>
          ) : null}
          <button type="button" className="btn btn-p" onClick={next} disabled={Boolean(blocker) || uploading || moving}>
            {nextLabel}
            <Icon name="chevR" />
          </button>
        </footer>
      ) : null}
    </div>
  );
}

function EnteringScreen({ step }: { step: number }) {
  const viewer = useViewer();
  const areas = viewer.profile.focusAreas.map((area) => FOCUS_AREA_SHORT[area]).join(', ') || 'your role';
  const labels = [
    `Applying your focus areas: ${areas}`,
    `Arranging ${viewer.layout.layout.length} widgets on your home page`,
    viewer.config.dataMode === 'demo' ? 'Loading sample records for your workspace' : 'Checking which sources are connected',
    'Preparing your Daily Brief',
  ];
  return (
    <div className="a-fade" style={{ height: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', background: 'var(--bg)', padding: 24 }}>
      <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 22, width: 'min(340px,100%)' }}>
        <RedSkyMark size={56} className="a-pop" />
        <div className="serif" style={{ fontSize: 26, textAlign: 'center' }}>
          Preparing your workspace
        </div>
        <div style={{ width: '100%', display: 'flex', flexDirection: 'column', gap: 10 }} role="status">
          {labels.map((label, index) => (
            <div key={label} style={{ display: 'flex', alignItems: 'center', gap: 10, fontSize: 13, opacity: index <= step ? 1 : 0.35, transition: 'opacity .3s' }}>
              <span style={{ width: 18, height: 18, borderRadius: '50%', display: 'flex', alignItems: 'center', justifyContent: 'center', flex: 'none', background: index < step ? 'var(--ok)' : 'var(--bd)', color: '#fff' }}>
                {index < step ? <Icon name="check" size="xs" strokeWidth={2.8} /> : null}
              </span>
              <span>{label}</span>
            </div>
          ))}
        </div>
        <span className="bar" style={{ width: '100%', height: 3 }}>
          <span style={{ width: `${Math.min(100, step * 25)}%`, transition: 'width .45s ease', animation: 'none' }} />
        </span>
      </div>
    </div>
  );
}
