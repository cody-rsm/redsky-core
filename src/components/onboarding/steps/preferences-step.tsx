'use client';

import { Icon } from '@/components/ui/icon';
import { DENSITIES, GOALS, LANDINGS, type Density } from '@/features/personalization/catalog';
import { useUpdatePreferences, useViewer } from '@/lib/client/viewer';
import { useWorkstyleSuggestion } from '../workstyle-suggestion';

type Block = { height: number; span: number; tone: 'accent' | 'strong' | 'soft' };
const BLOCK_COLOR: Record<Block['tone'], string> = { accent: 'var(--acs)', strong: 'var(--bd2)', soft: 'var(--bd)' };
const DENSITY_BLOCKS: Record<Density, ReadonlyArray<Block>> = {
  focused: [
    { height: 14, span: 6, tone: 'accent' },
    { height: 10, span: 4, tone: 'strong' },
    { height: 10, span: 2, tone: 'soft' },
  ],
  balanced: [
    { height: 12, span: 6, tone: 'accent' },
    { height: 10, span: 4, tone: 'strong' },
    { height: 10, span: 2, tone: 'soft' },
    { height: 10, span: 3, tone: 'soft' },
    { height: 10, span: 3, tone: 'strong' },
  ],
  comprehensive: [
    { height: 10, span: 6, tone: 'accent' },
    { height: 8, span: 4, tone: 'strong' },
    { height: 8, span: 2, tone: 'soft' },
    { height: 8, span: 2, tone: 'soft' },
    { height: 8, span: 2, tone: 'strong' },
    { height: 8, span: 2, tone: 'soft' },
    { height: 8, span: 3, tone: 'strong' },
    { height: 8, span: 3, tone: 'soft' },
  ],
};

export function PreferencesStep() {
  const viewer = useViewer();
  const update = useUpdatePreferences();
  const suggests = useWorkstyleSuggestion();
  const { goals, landing, density } = viewer.preferences;
  return (
    <div className="ob-inner a-in">
      <span className="lbl">Step 6 · Preferences</span>
      <h1 className="ob-h serif">How do you work?</h1>
      <p className="ob-sub">Three quick questions so your home page leads with what matters to you.</p>
      <div style={{ marginTop: 30 }}>
        <h2 className="qh">What would you like RedSky to help you with most?</h2>
        <p className="faint" style={{ fontSize: 12.5, marginBottom: 12 }}>
          Choose as many as you like.
        </p>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill,minmax(min(280px,100%),1fr))', gap: 8 }}>
          {GOALS.map((goal) => {
            const on = goals.includes(goal.id);
            return (
              <button key={goal.id} type="button" className="opt" aria-pressed={on} onClick={() => update.mutate({ goals: on ? goals.filter((id) => id !== goal.id) : [...goals, goal.id] })}>
                <Icon name={goal.icon} />
                <span className="grow">{goal.label}</span>
                {on ? <Icon name="check" size="s" style={{ color: 'var(--act)' }} /> : null}
              </button>
            );
          })}
        </div>
      </div>
      <div style={{ marginTop: 32 }}>
        <h2 className="qh">What would you prefer to see first when opening RedSky?</h2>
        <p className="faint" style={{ fontSize: 12.5, marginBottom: 12 }}>
          This becomes your default home view.
        </p>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill,minmax(min(200px,100%),1fr))', gap: 8 }}>
          {LANDINGS.map((option) => (
            <button key={option.id} type="button" className="sel" style={{ padding: 14 }} aria-pressed={landing === option.id} onClick={() => update.mutate({ landing: option.id })}>
              <span className="sel-chk r">
                <Icon name="check" size="xs" strokeWidth={2.6} />
              </span>
              <span className="tile tile-s">
                <Icon name={option.icon} size="s" />
              </span>
              <span style={{ fontWeight: 600 }}>{option.label}</span>
              <span className="faint" style={{ fontSize: 12 }}>
                {option.desc}
              </span>
            </button>
          ))}
        </div>
      </div>
      <div style={{ marginTop: 32 }}>
        <h2 className="qh">How much information do you want on your home page?</h2>
        <p className="faint" style={{ fontSize: 12.5, marginBottom: 12 }}>
          You can switch at any time from your home page.
        </p>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill,minmax(min(260px,100%),1fr))', gap: 10 }}>
          {DENSITIES.map((option) => (
            <button key={option.id} type="button" className="sel" aria-pressed={density === option.id} onClick={() => update.mutate({ density: option.id })}>
              <span className="sel-chk r">
                <Icon name="check" size="xs" strokeWidth={2.6} />
              </span>
              <span
                aria-hidden="true"
                style={{ height: 64, borderRadius: 8, background: 'var(--bg)', border: '1px solid var(--bd)', padding: 8, display: 'grid', gridTemplateColumns: 'repeat(6,minmax(0,1fr))', gap: 4, alignContent: 'start', width: '100%' }}
              >
                {DENSITY_BLOCKS[option.id].map((block, index) => (
                  <span key={index} style={{ height: block.height, gridColumn: `span ${block.span}`, borderRadius: 3, background: BLOCK_COLOR[block.tone] }} />
                ))}
              </span>
              <span style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
                <span style={{ fontWeight: 600 }}>{option.label}</span>
                {suggests('density', option.id) ? (
                  <span className="chip chip-ai" style={{ height: 18, fontSize: 10.5 }}>
                    Workstyle suggestion
                  </span>
                ) : null}
              </span>
              <span className="muted" style={{ fontSize: 12.5 }}>
                {option.desc}
              </span>
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}
