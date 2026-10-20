'use client';

import { useRouter } from 'next/navigation';
import { Icon } from '@/components/ui/icon';
import { MODULES, navItemById, ROADMAP_PHASES, type ModuleId } from '@/features/navigation/catalog';
import { landingHref } from '@/features/navigation/landing';
import { useUiStore } from '@/lib/client/ui-store';
import { useViewer } from '@/lib/client/viewer';

// Designed placeholder for modules on the roadmap (prototype): what the module will do and when.
export function ModuleView({ moduleId }: { moduleId: ModuleId }) {
  const viewer = useViewer();
  const router = useRouter();
  const askAi = useUiStore((state) => state.askAi);
  const definition = MODULES[moduleId];
  const nav = navItemById(moduleId);
  const title = nav?.label ?? 'Help';
  const phase = definition.phase ? ROADMAP_PHASES[definition.phase - 1] : null;
  return (
    <div className="page a-in" style={{ maxWidth: 920 }}>
      <div className="card" style={{ padding: 32, display: 'flex', flexDirection: 'column', gap: 20 }}>
        <div style={{ display: 'flex', gap: 14, alignItems: 'center', flexWrap: 'wrap' }}>
          <span className="tile" style={{ width: 46, height: 46, borderRadius: 12 }}>
            <Icon name={nav?.icon ?? 'help'} size="l" />
          </span>
          <div className="grow">
            <div className="lbl">{definition.group}</div>
            <h1 className="serif" style={{ marginTop: 3, fontSize: 32 }}>
              {title}
            </h1>
          </div>
          <span className="chip chip-o">{phase ? `Planned · Phase ${definition.phase} — ${phase.name}` : 'Available now'}</span>
        </div>
        <p style={{ fontSize: 15, color: 'var(--tx2)', maxWidth: 660, lineHeight: 1.6 }}>{definition.desc}</p>
        <div>
          <div className="lbl" style={{ marginBottom: 10 }}>
            Planned capabilities
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit,minmax(min(270px,100%),1fr))', gap: 8 }}>
            {definition.caps.map((capability) => (
              <div key={capability} style={{ display: 'flex', gap: 10, alignItems: 'flex-start', padding: '11px 12px', border: '1px solid var(--bd)', borderRadius: 9, fontSize: 13 }}>
                <Icon name="check" size="s" style={{ color: 'var(--act)', marginTop: 2 }} />
                <span>{capability}</span>
              </div>
            ))}
          </div>
        </div>
        <div>
          <div className="lbl" style={{ marginBottom: 10 }}>
            RedSky roadmap
          </div>
          <div className="road">
            {ROADMAP_PHASES.map((entry, index) => (
              <div key={entry.n} className="ph" data-on={index + 1 === definition.phase}>
                <span className="ph-b" />
                <b>
                  {entry.n} · {entry.name}
                </b>
                <span>{entry.outcome}</span>
                <span className="num">{entry.months}</span>
              </div>
            ))}
          </div>
          <p className="faint" style={{ fontSize: 11.5, marginTop: 10 }}>
            Timelines are planning estimates, contingent on staffing, approvals and complexity.
          </p>
        </div>
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
          <button type="button" className="btn btn-ai" onClick={() => void askAi(`Tell me about the ${title} module`, { key: 'module', ref: moduleId })}>
            <Icon name="ai" size="s" />
            Ask RedSky about {title}
          </button>
          <button type="button" className="btn" onClick={() => router.push(landingHref(viewer.preferences.landing))}>
            Back to Home
          </button>
        </div>
      </div>
    </div>
  );
}
