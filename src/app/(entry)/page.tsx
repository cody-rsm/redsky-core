import { redirect } from 'next/navigation';
import { ONBOARDING_STEPS } from '@/features/onboarding/steps';
import { getSessionUser } from '@/server/auth/session';
import { loadViewer } from '@/server/services/viewer-service';
import { landingHref } from '@/features/navigation/landing';

export default async function EntryPage() {
  const user = await getSessionUser();
  if (!user) redirect('/login');
  const viewer = await loadViewer(user);
  if (!viewer.onboarding.completed) redirect(`/onboarding/${ONBOARDING_STEPS[viewer.onboarding.currentStep]?.slug ?? 'welcome'}`);
  redirect(landingHref(viewer.preferences.landing));
}
