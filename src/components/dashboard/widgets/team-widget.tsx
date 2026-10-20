'use client';

import { Avatar, normalizeTone } from '@/components/ui/avatar';
import { useUiStore } from '@/lib/client/ui-store';
import { useWidget } from '@/lib/client/use-widget';
import { WidgetFrame, type WidgetSlot } from '../widget-frame';
import { WidgetBody } from '../widget-states';

export function TeamWidget({ slot }: { slot: WidgetSlot }) {
  const query = useWidget('team');
  const toast = useUiStore((state) => state.toast);
  return (
    <WidgetFrame slot={slot} sub="Last 7 days" more={{ label: 'Activity', onClick: () => toast('The team activity view arrives with Phase 3') }}>
      <WidgetBody query={query} rows={4}>
        {(data) => (
          <div className="wb">
            {data.items.length === 0 ? <div className="empty">No team activity this week.</div> : null}
            {data.items.slice(0, slot.itemLimit).map((item) => (
              <div key={`${item.name}-${item.what}`} className="row" style={{ alignItems: 'center' }}>
                <Avatar initials={item.initials} tone={normalizeTone(item.tone)} size="sm" />
                <div className="grow" style={{ fontSize: 12.5, lineHeight: 1.4 }}>
                  <span style={{ fontWeight: 500 }}>{item.name}</span> <span className="muted">{item.what}</span>
                </div>
                <span className="faint num" style={{ fontSize: 11.5, whiteSpace: 'nowrap' }}>
                  {item.when}
                </span>
              </div>
            ))}
          </div>
        )}
      </WidgetBody>
    </WidgetFrame>
  );
}
