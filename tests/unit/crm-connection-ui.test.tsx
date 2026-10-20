// @vitest-environment jsdom
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { cleanup, render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import type { ReactNode } from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { ConfirmDialog } from '@/components/common/confirm-dialog';
import { CrmConnectionRow } from '@/components/integrations/crm-connection';
import { PeopleView } from '@/components/pages/people-view';
import type { CrmConnectionView, ViewerPayload } from '@/lib/api/contracts';
import { useUiStore } from '@/lib/client/ui-store';
import { ViewerProvider } from '@/lib/client/viewer';

vi.mock('next/navigation', () => ({
  usePathname: () => '/people',
  useRouter: () => ({ push: vi.fn(), replace: vi.fn() }),
  useSearchParams: () => new URLSearchParams(),
}));

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

const json = (body: unknown) => new Response(JSON.stringify(body), { status: 200, headers: { 'Content-Type': 'application/json' } });

// The row reads only the viewer's CRM connection.
const withViewer = (crm: CrmConnectionView, node: ReactNode) => (
  <QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}>
    <ViewerProvider initial={{ crm } as ViewerPayload}>{node}</ViewerProvider>
  </QueryClientProvider>
);

describe('People and the person’s Twenty connection', () => {
  it('asks the person to connect Twenty, and returns them to People afterwards', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => json({ status: 'connect', reconnect: false })));
    render(withViewer({ status: 'not_connected', account: null }, <PeopleView />));
    const link = await screen.findByRole('link', { name: 'Connect Twenty' });
    expect(link).toHaveAttribute('href', '/api/integrations/twenty/connect?returnTo=%2Fpeople');
  });

  it('asks to reconnect once Twenty stops accepting the connection', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => json({ status: 'connect', reconnect: true })));
    render(withViewer({ status: 'reconnect', account: 'eleanor.vance@rsmcapital.com' }, <PeopleView />));
    expect(await screen.findByRole('link', { name: 'Reconnect Twenty' })).toBeInTheDocument();
    expect(screen.getByText(/no longer accepts RedSky’s access/)).toBeInTheDocument();
  });

  it('says the person’s CRM role excludes people, without offering a retry that can’t help', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => json({ status: 'forbidden' })));
    render(withViewer({ status: 'connected', account: 'marcus.chen@rsmcapital.com' }, <PeopleView />));
    expect(await screen.findByText('Your CRM role doesn’t include people')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Try again' })).toBeNull();
    expect(screen.queryByRole('table', { name: 'People' })).toBeNull();
  });
});

describe('CrmConnectionRow', () => {
  it('shows whose Twenty account is connected, and disconnects only after confirmation', async () => {
    const user = userEvent.setup();
    const disconnected = { status: 'not_connected', account: null };
    const fetchMock = vi.fn(async (path: string, _init?: RequestInit) => json(path === '/api/me' ? { crm: disconnected } : disconnected));
    vi.stubGlobal('fetch', fetchMock);
    render(
      withViewer(
        { status: 'connected', account: 'eleanor.vance@rsmcapital.com' },
        <>
          <CrmConnectionRow />
          <ConfirmDialog />
        </>,
      ),
    );
    expect(screen.getByText(/Connected as eleanor.vance@rsmcapital.com/)).toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: 'Disconnect' }));
    const dialog = await screen.findByRole('alertdialog', { name: 'Disconnect Twenty?' });
    expect(fetchMock).not.toHaveBeenCalled();
    await user.click(within(dialog).getByRole('button', { name: 'Disconnect' }));

    const deleteCall = fetchMock.mock.calls.find(([, init]) => init?.method === 'DELETE');
    expect(deleteCall?.[0]).toBe('/api/integrations/twenty');
    expect(useUiStore.getState().toastState?.message).toBe('Twenty disconnected');
    expect(await screen.findByRole('link', { name: 'Connect' })).toBeInTheDocument();
  });

  it('offers to connect when the person hasn’t yet', () => {
    render(withViewer({ status: 'not_connected', account: null }, <CrmConnectionRow />));
    expect(screen.getByRole('link', { name: 'Connect' })).toHaveAttribute('href', '/api/integrations/twenty/connect?returnTo=%2Fpeople');
    expect(screen.queryByRole('button', { name: 'Disconnect' })).toBeNull();
  });
});
