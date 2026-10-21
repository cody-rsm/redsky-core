// @vitest-environment jsdom
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { cleanup, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { PeopleView } from '@/components/pages/people-view';

const navigation = vi.hoisted(() => ({ search: '' }));
vi.mock('next/navigation', () => ({
  useRouter: () => ({ push: vi.fn(), refresh: vi.fn() }),
  useSearchParams: () => new URLSearchParams(navigation.search),
}));

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
  navigation.search = '';
});

function renderPeople(response: unknown) {
  vi.stubGlobal('fetch', vi.fn(async () => new Response(JSON.stringify(response), { status: 200, headers: { 'content-type': 'application/json' } })));
  render(
    <QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}>
      <PeopleView />
    </QueryClientProvider>,
  );
}

describe('People and the CRM connection', () => {
  it('asks people who have not connected to connect as themselves', async () => {
    renderPeople({ status: 'connect_required' });
    expect(await screen.findByText('Connect to the RSM CRM')).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Connect CRM' })).toHaveAttribute('href', '/api/integrations/twenty/connect?returnTo=%2Fpeople');
    expect(screen.queryByRole('alert')).toBeNull();
  });

  it('says when connecting did not finish', async () => {
    navigation.search = 'crm=failed';
    renderPeople({ status: 'connect_required' });
    expect(await screen.findByRole('alert')).toHaveTextContent('RedSky couldn’t finish connecting');
  });
});
