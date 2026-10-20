import { redirect } from 'next/navigation';
import type { ReactNode } from 'react';
import { WorkspaceShell } from '@/components/layout/workspace-shell';
import { ONBOARDING_STEPS } from '@/features/onboarding/steps';
import { ViewerProvider } from '@/lib/client/viewer';
import { getSessionUser } from '@/server/auth/session';
import { loadViewer } from '@/server/services/viewer-service';

// Every workspace page is per-employee: the session is checked here (the proxy redirect is only optimistic),
// and employees who have not finished onboarding are sent back to their step.
export default async function WorkspaceLayout({ children }: { children: ReactNode }) {
  const user = await getSessionUser();
  if (!user) redirect('/login');
  const viewer = await loadViewer(user);
  if (!viewer.onboarding.completed) redirect(`/onboarding/${ONBOARDING_STEPS[viewer.onboarding.currentStep]?.slug ?? 'welcome'}`);
  return (
    <ViewerProvider initial={viewer}>
      <WorkspaceShell>{children}</WorkspaceShell>
    </ViewerProvider>
  );
}
