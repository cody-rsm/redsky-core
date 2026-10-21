// @vitest-environment jsdom
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { act, cleanup, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { QuickCreateModal } from '@/components/overlays/quick-create-modal';
import { NAV_GROUPS } from '@/features/navigation/catalog';
import type { ViewerPayload } from '@/lib/api/contracts';
import { useUiStore } from '@/lib/client/ui-store';
import { ViewerProvider } from '@/lib/client/viewer';

vi.mock('next/navigation', () => ({ useRouter: () => ({ push: vi.fn(), refresh: vi.fn() }) }));

// The create form reads only the public config from the viewer.
const viewer = { config: { dataMode: 'production', documentsAvailable: false } } as unknown as ViewerPayload;

afterEach(() => {
  act(() => useUiStore.getState().closeCreate());
  cleanup();
});

function renderModal() {
  render(
    <QueryClientProvider client={new QueryClient()}>
      <ViewerProvider initial={viewer}>
        <QuickCreateModal />
      </ViewerProvider>
    </QueryClientProvider>,
  );
}

describe('QuickCreateModal', () => {
  it('adds a contact without a relationship owner', () => {
    act(() => useUiStore.getState().openCreate('contact'));
    renderModal();
    expect(screen.getByLabelText('Full name')).toBeInTheDocument();
    expect(screen.getByLabelText('Organization')).toBeInTheDocument();
    expect(screen.queryByText('Relationship owner')).toBeNull();
    expect(screen.queryByRole('button', { name: 'Tom Becker' })).toBeNull();
  });

  it('keeps the choice on forms that have one', () => {
    act(() => useUiStore.getState().openCreate('task'));
    renderModal();
    expect(screen.getByText('Due')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Today' })).toBeInTheDocument();
  });
});

describe('sidebar sections', () => {
  it('lists Documents under Workspace and names the last section Intelligence', () => {
    const workspace = NAV_GROUPS.find((group) => group.label === 'Workspace');
    expect(workspace?.items.map((item) => item.label)).toContain('Documents');
    expect(NAV_GROUPS.map((group) => group.label)).toEqual(['Workspace', 'Relationships', 'Investments', 'Operations', 'Intelligence']);
    expect(NAV_GROUPS.find((group) => group.label === 'Intelligence')?.items.map((item) => item.label)).toEqual(['Research', 'Intelligence', 'RedSky AI']);
  });
});
