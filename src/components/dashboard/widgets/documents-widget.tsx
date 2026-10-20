'use client';

import { useRouter } from 'next/navigation';
import { Tile } from '@/components/ui/tile';
import { useWidget } from '@/lib/client/use-widget';
import { useWorkspaceActions } from '@/lib/client/workspace-actions';
import { WidgetFrame, type WidgetSlot } from '../widget-frame';
import { WidgetBody } from '../widget-states';

export function DocumentsWidget({ slot }: { slot: WidgetSlot }) {
  const router = useRouter();
  const query = useWidget('documents');
  const { openRecord } = useWorkspaceActions();
  const sub = query.data ? (query.data.status === 'ok' ? 'This week' : 'Not connected') : undefined;
  return (
    <WidgetFrame slot={slot} sub={sub} more={{ label: 'Documents', onClick: () => router.push('/m/documents') }}>
      <WidgetBody query={query} rows={4}>
        {(data) => (
          <div className="wb">
            {data.items.length === 0 ? <div className="empty">No recent documents.</div> : null}
            {data.items.slice(0, slot.itemLimit).map((item) => (
              <div key={item.id} className="row" style={{ alignItems: 'center' }}>
                <Tile icon="doc" small />
                <div className="grow">
                  <button type="button" className="rel ell" style={{ maxWidth: '100%', display: 'block' }} onClick={() => openRecord('doc', item.id)}>
                    {item.name}
                  </button>
                  <div className="faint ell" style={{ fontSize: 11.5, marginTop: 2 }}>
                    {item.meta}
                  </div>
                </div>
                <span className="chip hide-sm">{item.kind}</span>
              </div>
            ))}
          </div>
        )}
      </WidgetBody>
    </WidgetFrame>
  );
}
