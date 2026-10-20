import type { CSSProperties } from 'react';
import type { WidgetPreviewKind } from '@/features/personalization/catalog';

// Skeleton thumbnails for the widget gallery (prototype .mini previews), one per preview kind.
function Bar({ width, className = 'sk', style }: { width: string; className?: string; style?: CSSProperties }) {
  return <span className={className} style={{ width, ...style }} />;
}

function ListLine({ width, accent }: { width: string; accent?: boolean }) {
  return (
    <span style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
      <span className={accent ? 'sk sk-a' : 'sk'} style={{ width: 6, height: 6, borderRadius: '50%' }} />
      <span className={accent ? 'sk sk-d' : 'sk'} style={{ width }} />
    </span>
  );
}

function MiniCard({ widths }: { widths: [string, string, string] }) {
  return (
    <span style={{ flex: 1, border: '1px solid var(--bd)', borderRadius: 5, background: 'var(--sf)', padding: 6, display: 'flex', flexDirection: 'column', gap: 4 }}>
      <Bar className="sk sk-d" width={widths[0]} />
      <Bar width={widths[1]} />
      <Bar className="sk sk-ai" width={widths[2]} style={{ marginTop: 'auto' }} />
    </span>
  );
}

const CHART = [
  ['sk sk-d', '85%'],
  ['sk sk-d', '65%'],
  ['sk sk-d', '48%'],
  ['sk sk-a', '30%'],
  ['sk sk-d', '22%'],
  ['sk', '58%'],
] as const;

function Steps({ accentAt }: { accentAt: number }) {
  return (
    <span style={{ display: 'grid', gridTemplateColumns: 'repeat(5,1fr)', gap: 3 }}>
      {[0, 1, 2, 3, 4].map((index) => (
        <span key={index} className={index < accentAt ? 'sk sk-d' : index === accentAt ? 'sk sk-a' : 'sk'} style={{ height: 4 }} />
      ))}
    </span>
  );
}

export function WidgetMiniPreview({ kind }: { kind: WidgetPreviewKind }) {
  return (
    <div className="mini" aria-hidden="true">
      {kind === 'brief' ? (
        <>
          <Bar className="sk sk-a" width="30%" style={{ height: 4 }} />
          <Bar className="sk sk-d" width="70%" style={{ height: 9 }} />
          <Bar width="90%" />
          <Bar width="60%" />
        </>
      ) : null}
      {kind === 'list' ? (
        <>
          <ListLine width="62%" accent />
          <ListLine width="74%" />
          <ListLine width="50%" />
          <ListLine width="66%" />
        </>
      ) : null}
      {kind === 'cards' ? (
        <span style={{ display: 'flex', gap: 6, flex: 1 }}>
          <MiniCard widths={['70%', '50%', '80%']} />
          <MiniCard widths={['60%', '40%', '70%']} />
        </span>
      ) : null}
      {kind === 'chart' ? (
        <span style={{ display: 'flex', gap: 5, alignItems: 'flex-end', flex: 1 }}>
          {CHART.map(([className, height], index) => (
            <span key={index} className={className} style={{ flex: 1, height, borderRadius: 2 }} />
          ))}
        </span>
      ) : null}
      {kind === 'feed' ? (
        <>
          <Bar width="24%" style={{ height: 4 }} />
          <Bar className="sk sk-d" width="84%" />
          <Bar className="sk sk-ai" width="64%" />
          <Bar width="24%" style={{ height: 4, marginTop: 4 }} />
          <Bar className="sk sk-d" width="72%" />
        </>
      ) : null}
      {kind === 'timeline' ? (
        <>
          <Bar className="sk sk-d" width="68%" />
          <Steps accentAt={2} />
          <Bar className="sk sk-d" width="54%" style={{ marginTop: 6 }} />
          <Steps accentAt={1} />
        </>
      ) : null}
    </div>
  );
}
