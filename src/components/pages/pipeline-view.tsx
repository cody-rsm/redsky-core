'use client';

import { useQuery } from '@tanstack/react-query';
import { WidgetBody } from '@/components/dashboard/widget-states';
import { Avatar, normalizeTone } from '@/components/ui/avatar';
import { Icon } from '@/components/ui/icon';
import type { PipelineBoard, WidgetResponse } from '@/lib/api/contracts';
import { apiFetch } from '@/lib/client/api';
import { queryKeys } from '@/lib/client/query-client';
import { useUiStore } from '@/lib/client/ui-store';
import { useWorkspaceActions } from '@/lib/client/workspace-actions';

export function PipelineView() {
  const { openCreate, askAi } = useUiStore.getState();
  const { openRecord } = useWorkspaceActions();
  const query = useQuery({ queryKey: queryKeys.pipelineBoard, queryFn: () => apiFetch<WidgetResponse<PipelineBoard>>('/api/pipeline') });
  const total = query.data?.status === 'ok' ? query.data.data.totalLabel : null;
  return (
    <div className="page a-in" style={{ maxWidth: 1600 }}>
      <div style={{ display: 'flex', alignItems: 'flex-end', gap: 12, flexWrap: 'wrap', marginBottom: 18 }}>
        <div className="grow">
          <div className="lbl">Investments · Preview of Phase 3 module</div>
          <h1 className="serif" style={{ fontSize: 32, marginTop: 4 }}>
            Deal Pipeline
          </h1>
          <p className="muted" style={{ marginTop: 4 }}>
            {total ? `Illustrative sample data. ${total}.` : 'Stages and opportunities from RSM’s deal records.'}
          </p>
        </div>
        <button type="button" className="btn btn-sm" onClick={() => openCreate('opportunity')}>
          <Icon name="plus" size="s" />
          Add opportunity
        </button>
        <button type="button" className="btn btn-sm btn-ai" onClick={() => void askAi('What changed in our investment pipeline?', { key: 'pipeline' })}>
          <Icon name="ai" size="s" />
          What changed this week?
        </button>
      </div>
      <div className="card" style={query.data?.status === 'ok' ? { border: 'none', background: 'transparent' } : undefined}>
        <WidgetBody query={query} rows={5}>
          {(board) => (
            <div className="kan scroll">
              {board.columns.map((column) => (
                <div key={column.name} className="kcol">
                  <div style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '2px 4px 4px' }}>
                    <span style={{ fontWeight: 600, fontSize: 12.5 }}>{column.name}</span>
                    <span className="chip">{column.count}</span>
                    <div className="grow" />
                    <span className="faint num" style={{ fontSize: 11.5 }}>
                      {column.value}
                    </span>
                  </div>
                  {column.deals.map((deal) => (
                    <button key={deal.id} type="button" className="kcard" onClick={() => openRecord('deal', deal.id)}>
                      <span style={{ display: 'flex', alignItems: 'flex-start', gap: 8, width: '100%' }}>
                        <span className="grow">
                          <span style={{ fontWeight: 600, display: 'block' }}>{deal.name}</span>
                          <span className="faint" style={{ fontSize: 11.5 }}>
                            {deal.round} · {deal.sector}
                          </span>
                        </span>
                        <span className="num" style={{ fontSize: 12, fontWeight: 500 }}>
                          {deal.amount}
                        </span>
                      </span>
                      <span className="muted" style={{ fontSize: 12, lineHeight: 1.4 }}>
                        {deal.activity}
                      </span>
                      <span style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 11.5 }} className="faint">
                        <Avatar initials={deal.lead.initials} tone={normalizeTone(deal.lead.tone)} size="sm" />
                        {deal.lead.name}
                      </span>
                    </button>
                  ))}
                  {column.more > 0 ? (
                    <div className="faint" style={{ fontSize: 11.5, textAlign: 'center', padding: 4 }}>
                      + {column.more} more
                    </div>
                  ) : null}
                </div>
              ))}
            </div>
          )}
        </WidgetBody>
      </div>
    </div>
  );
}
