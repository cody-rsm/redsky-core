'use client';

import { Icon } from '@/components/ui/icon';
import { Tile } from '@/components/ui/tile';
import { useUiStore } from '@/lib/client/ui-store';
import { useWidget } from '@/lib/client/use-widget';
import { useWorkspaceActions } from '@/lib/client/workspace-actions';
import { WidgetFrame, type WidgetSlot } from '../widget-frame';
import { WidgetBody } from '../widget-states';

export function ApprovalsWidget({ slot }: { slot: WidgetSlot }) {
  const query = useWidget('approvals');
  const askAi = useUiStore((state) => state.askAi);
  const { approve, openRecord } = useWorkspaceActions();
  const sub = query.data?.status === 'ok' ? `${query.data.data.items.filter((item) => !item.approved).length} pending` : undefined;
  return (
    <WidgetFrame slot={slot} sub={sub} more={{ label: 'All approvals', onClick: () => void askAi('What decisions are waiting on me?', { key: 'decisions' }) }}>
      <WidgetBody query={query} rows={3}>
        {(data) => (
          <div className="wb">
            {data.items.length === 0 ? <div className="empty">Nothing is waiting on your approval.</div> : null}
            {data.items.map((item) => (
              <div key={item.id} className="row" style={{ alignItems: 'center', flexWrap: 'wrap' }}>
                <Tile icon="diligence" small />
                <div style={{ flex: '1 1 220px', minWidth: 0 }}>
                  <div style={{ fontWeight: 500 }}>{item.title}</div>
                  <div className="faint" style={{ fontSize: 12, marginTop: 2 }}>
                    Requested by {item.requestedBy} · <span className={`due due-${item.dueTone}`}>{item.due}</span>
                  </div>
                </div>
                {item.approved ? (
                  <span className="chip chip-ok">
                    <Icon name="check" size="xs" strokeWidth={2.6} />
                    Approved
                  </span>
                ) : (
                  <div style={{ display: 'flex', gap: 6 }}>
                    <button type="button" className="btn btn-sm" onClick={() => openRecord(item.record.kind, item.record.id)}>
                      Review
                    </button>
                    <button type="button" className="btn btn-sm btn-p" onClick={() => approve({ id: item.id, title: item.title, requestedBy: item.requestedBy })}>
                      Approve
                    </button>
                  </div>
                )}
              </div>
            ))}
          </div>
        )}
      </WidgetBody>
    </WidgetFrame>
  );
}
