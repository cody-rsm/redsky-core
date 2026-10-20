'use client';

import { useInfiniteQuery } from '@tanstack/react-query';
import { strengthTone } from '@/components/dashboard/strength';
import { WidgetLoading } from '@/components/dashboard/widget-states';
import { Avatar, normalizeTone } from '@/components/ui/avatar';
import { Icon } from '@/components/ui/icon';
import type { PeopleResponse } from '@/lib/api/contracts';
import { apiFetch } from '@/lib/client/api';
import { queryKeys } from '@/lib/client/query-client';
import { useUiStore } from '@/lib/client/ui-store';
import { useWorkspaceActions } from '@/lib/client/workspace-actions';

export function PeopleView() {
  const { openCreate, askAi } = useUiStore.getState();
  const { openRecord } = useWorkspaceActions();
  const query = useInfiniteQuery({
    queryKey: queryKeys.people,
    queryFn: ({ pageParam }) => apiFetch<PeopleResponse>(`/api/people${pageParam ? `?cursor=${encodeURIComponent(pageParam)}` : ''}`),
    initialPageParam: null as string | null,
    getNextPageParam: (last) => (last.status === 'ok' ? last.nextCursor : null),
  });
  const first = query.data?.pages[0];
  const rows = query.data?.pages.flatMap((page) => (page.status === 'ok' ? page.rows : [])) ?? [];
  const sample = first?.status === 'ok' && first.sample;

  return (
    <div className="page a-in">
      <div style={{ display: 'flex', alignItems: 'flex-end', gap: 12, flexWrap: 'wrap', marginBottom: 18 }}>
        <div className="grow">
          <div className="lbl">Relationships</div>
          <h1 className="serif" style={{ fontSize: 32, marginTop: 4 }}>
            People
          </h1>
          <p className="muted" style={{ marginTop: 4 }}>
            Every relationship across RSM you’re authorized to see.{sample ? ' Sample records.' : ''}
          </p>
        </div>
        <button type="button" className="btn btn-sm" onClick={() => openCreate('contact')}>
          <Icon name="plus" size="s" />
          Add contact
        </button>
        <button type="button" className="btn btn-sm btn-ai" onClick={() => void askAi('Who should I reconnect with?', { key: 'reconnect' })}>
          <Icon name="ai" size="s" />
          Who should I reconnect with?
        </button>
      </div>
      <div className="card" style={{ overflow: 'hidden' }}>
        {query.isPending ? <WidgetLoading rows={6} /> : null}
        {query.isError ? (
          <div className="wstate" role="alert">
            <b>Couldn’t load people</b>
            <span>{query.error.message}</span>
            <button type="button" className="btn btn-sm" onClick={() => void query.refetch()}>
              Try again
            </button>
          </div>
        ) : null}
        {first?.status === 'not_connected' ? (
          <div className="empty">
            <span className="lt lt-0" aria-hidden="true">
              CR
            </span>
            <div style={{ fontWeight: 600, color: 'var(--tx)' }}>People come from the RSM CRM</div>
            <div style={{ fontSize: 12.5, maxWidth: 360 }}>Once your administrator connects RedSky to the CRM, the contacts you’re authorized to see appear here.</div>
          </div>
        ) : null}
        {first?.status === 'error' ? (
          <div className="wstate" role="alert">
            <b>Couldn’t reach the CRM</b>
            <span>{first.message}</span>
            <button type="button" className="btn btn-sm" onClick={() => void query.refetch()}>
              Try again
            </button>
          </div>
        ) : null}
        {first?.status === 'ok' ? (
          <div className="tlist" style={{ padding: '4px 10px' }} role="table" aria-label="People">
            <div className="trow th" role="row" data-cols="pp">
              <span role="columnheader">Name</span>
              <span role="columnheader">Organization</span>
              <span role="columnheader" className="hide-sm">
                Relationship owner
              </span>
              <span role="columnheader" className="hide-sm">
                Last meaningful interaction
              </span>
              <span role="columnheader">Strength</span>
            </div>
            {rows.map((person) => (
              <div key={person.id} className="trow" role="row" data-cols="pp">
                <span role="cell" style={{ display: 'flex', alignItems: 'center', gap: 10, minWidth: 0 }}>
                  <Avatar initials={person.initials} tone={normalizeTone(person.tone)} size="sm" />
                  <span style={{ minWidth: 0 }}>
                    <button type="button" className="rel" onClick={() => openRecord('contact', person.id)}>
                      {person.name}
                    </button>
                    <span className="faint ell" style={{ display: 'block', fontSize: 11.5 }}>
                      {person.title}
                    </span>
                  </span>
                </span>
                <span role="cell">{person.org}</span>
                <span role="cell" className="hide-sm muted">
                  {person.owner}
                </span>
                <span role="cell" className="hide-sm muted">
                  {person.last}
                </span>
                <span role="cell">{person.strength ? <span className={`chip ${strengthTone(person.strength)}`}>{person.strength}</span> : <span className="faint">—</span>}</span>
              </div>
            ))}
            {rows.length === 0 ? <div className="empty">No contacts yet.</div> : null}
          </div>
        ) : null}
      </div>
      {query.hasNextPage ? (
        <div style={{ display: 'flex', justifyContent: 'center', marginTop: 12 }}>
          <button type="button" className="btn btn-sm" onClick={() => void query.fetchNextPage()} disabled={query.isFetchingNextPage}>
            {query.isFetchingNextPage ? 'Loading…' : 'Load more'}
          </button>
        </div>
      ) : null}
    </div>
  );
}
