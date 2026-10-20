import type { Metadata } from 'next';
import { notFound, redirect } from 'next/navigation';
import { ConfirmDialog } from '@/components/common/confirm-dialog';
import { ToastViewport } from '@/components/common/toast-viewport';
import { OnboardingFlow } from '@/components/onboarding/onboarding-flow';
import { landingHref } from '@/features/navigation/landing';
import { ONBOARDING_STEPS, stepIndexForSlug } from '@/features/onboarding/steps';
import { ViewerProvider } from '@/lib/client/viewer';
import { getSessionUser } from '@/server/auth/session';
import { loadViewer } from '@/server/services/viewer-service';

export const metadata: Metadata = { title: 'Set up RedSky' };

// Progress is saved per employee, so a refresh or a later visit resumes on the same step. Steps beyond the
// furthest one reached are not addressable.
export default async function OnboardingStepPage({ params }: { params: Promise<{ step: string }> }) {
  const { step } = await params;
  const index = stepIndexForSlug(step);
  if (index < 0) notFound();
  const user = await getSessionUser();
  if (!user) redirect(`/login?returnTo=/onboarding/${step}`);
  const viewer = await loadViewer(user);
  if (viewer.onboarding.completed) redirect(landingHref(viewer.preferences.landing));
  if (index > viewer.onboarding.maxStep) redirect(`/onboarding/${ONBOARDING_STEPS[viewer.onboarding.currentStep]?.slug ?? 'welcome'}`);
  return (
    <ViewerProvider initial={viewer}>
      <OnboardingFlow stepIndex={index} />
      <ConfirmDialog />
      <ToastViewport />
    </ViewerProvider>
  );
}
