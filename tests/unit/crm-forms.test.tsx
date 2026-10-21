// @vitest-environment jsdom
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { act, cleanup, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { QuickCreateModal } from '@/components/overlays/quick-create-modal';
import type { ViewerPayload } from '@/lib/api/contracts';
import { useUiStore } from '@/lib/client/ui-store';
import { ViewerProvider } from '@/lib/client/viewer';

vi.mock('next/navigation', () => ({ useRouter: () => ({ push: vi.fn(), refresh: vi.fn() }) }));

// The forms read only the public config and the person's CRM connection from the viewer.
const connected = { config: { dataMode: 'production', crmAccess: 'per_user', documentsAvailable: false }, crm: 'connected' } as unknown as ViewerPayload;

afterEach(() => {
  act(() => useUiStore.getState().closeCreate());
  cleanup();
  vi.unstubAllGlobals();
});

function stubApi(routes: Record<string, unknown>) {
  const calls: Array<{ path: string; body: Record<string, unknown> }> = [];
  vi.stubGlobal(
    'fetch',
    vi.fn(async (path: string, init?: RequestInit) => {
      calls.push({ path, body: init?.body ? JSON.parse(String(init.body)) : {} });
      return new Response(JSON.stringify(routes[path] ?? {}), { status: 200, headers: { 'content-type': 'application/json' } });
    }),
  );
  return calls;
}

function renderModal(viewer: ViewerPayload) {
  render(
    <QueryClientProvider client={new QueryClient()}>
      <ViewerProvider initial={viewer}>
        <QuickCreateModal />
      </ViewerProvider>
    </QueryClientProvider>,
  );
}

describe('Add contact', () => {
  it('shows possible duplicates and the organization choice before adding', async () => {
    const user = userEvent.setup();
    const calls = stubApi({
      '/api/crm/contacts/review': {
        duplicates: [{ id: 'p0', name: 'Jordan Alvarez', email: 'jordan@halcyon.example', organization: 'Halcyon Robotics' }],
        organizations: [{ id: '6f2c1a0e-1b2c-4d5e-8f90-1a2b3c4d5e6f', name: 'Halcyon Robotics', domain: 'halcyon.example' }],
      },
      '/api/crm/contacts': { id: 'p1', message: 'Jordan Alvarez added to the CRM' },
    });
    act(() => useUiStore.getState().openCreate('contact'));
    renderModal(connected);

    await user.type(screen.getByLabelText('Full name'), 'Jordan Alvarez');
    await user.type(screen.getByLabelText('Email'), 'jordan@halcyon.example');
    await user.type(screen.getByLabelText('Organization'), 'Halcyon Robotics');
    await user.click(screen.getByRole('button', { name: 'Review' }));

    expect(await screen.findByText('This person may already be in the CRM:')).toBeInTheDocument();
    expect(screen.getByRole('radio', { name: /Halcyon Robotics.*already in the CRM/ })).toBeChecked();
    expect(calls.filter((call) => call.path === '/api/crm/contacts')).toHaveLength(0);

    await user.click(screen.getByRole('button', { name: 'Add anyway' }));
    const add = calls.find((call) => call.path === '/api/crm/contacts');
    expect(add?.body).toMatchObject({ fullName: 'Jordan Alvarez', email: 'jordan@halcyon.example', organizationId: '6f2c1a0e-1b2c-4d5e-8f90-1a2b3c4d5e6f', createOrganization: false });
    expect(add?.body.requestKey).toMatch(/^[0-9a-f-]{36}$/);
  });

  it('asks people who have not connected to connect first', () => {
    act(() => useUiStore.getState().openCreate('contact'));
    renderModal({ ...connected, crm: 'connect_required' } as ViewerPayload);
    expect(screen.getByRole('status')).toHaveTextContent('Connect to the RSM CRM first');
  });
});

describe('Add note', () => {
  it('adds a note to the record it was opened from', async () => {
    const user = userEvent.setup();
    const calls = stubApi({ '/api/crm/notes': { id: 'n1', message: 'Note added' } });
    act(() => useUiStore.getState().openCreate('note', { target: { kind: 'company', id: '9a8b7c6d-5e4f-4a3b-8c2d-1e0f9a8b7c6d', label: 'Halcyon Robotics' } }));
    renderModal(connected);

    expect(screen.getByText('Add note · Halcyon Robotics')).toBeInTheDocument();
    await user.type(screen.getByLabelText('Note'), 'Board meeting moved to June.');
    await user.click(screen.getByRole('button', { name: 'Add note' }));
    expect(calls.find((call) => call.path === '/api/crm/notes')?.body).toMatchObject({ target: { kind: 'company', id: '9a8b7c6d-5e4f-4a3b-8c2d-1e0f9a8b7c6d' }, body: 'Board meeting moved to June.' });
  });
});
