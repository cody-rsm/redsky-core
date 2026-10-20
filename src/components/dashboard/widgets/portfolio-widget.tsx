'use client';

import { useRouter } from 'next/navigation';
import { useWidget } from '@/lib/client/use-widget';
import { WidgetFrame, type WidgetSlot } from '../widget-frame';
import { WidgetBody, widgetSample } from '../widget-states';

export function PortfolioWidget({ slot }: { slot: WidgetSlot }) {
  const router = useRouter();
  const query = useWidget('portfolio');
  const sub = query.data?.status === 'ok' ? `${query.data.data.items.length} companies` : undefined;
  return (
    <WidgetFrame slot={slot} sub={sub} sample={widgetSample(query)} more={{ label: 'Portfolio', onClick: () => router.push('/m/portfolio') }}>
      <WidgetBody query={query} rows={4}>
        {(data) => (
          <div className="wb tlist" style={{ padding: '0 14px 12px' }} role="table" aria-label="Portfolio watchlist">
            <div className="trow th" role="row" data-cols="pf">
              <span role="columnheader">Company</span>
              <span role="columnheader">Latest update</span>
              <span role="columnheader">Status</span>
              <span role="columnheader" className="hide-sm">
                Owner
              </span>
            </div>
            {data.items.map((item) => (
              <div key={item.name} className="trow" role="row" data-cols="pf">
                <span role="cell" style={{ minWidth: 0 }}>
                  <span style={{ fontWeight: 500, display: 'block' }}>{item.name}</span>
                  <span className="faint ell" style={{ display: 'block', fontSize: 11.5 }}>
                    {item.sector}
                  </span>
                </span>
                <span role="cell" className="muted">
                  {item.update}
                </span>
                <span role="cell">
                  <span className={`status st-${item.tone}`}>
                    <span className="dot" />
                    {item.status}
                  </span>
                </span>
                <span role="cell" className="hide-sm faint ell">
                  {item.owner}
                </span>
              </div>
            ))}
          </div>
        )}
      </WidgetBody>
    </WidgetFrame>
  );
}
