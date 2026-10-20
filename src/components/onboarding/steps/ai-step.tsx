'use client';

import { Icon } from '@/components/ui/icon';
import { Switch } from '@/components/ui/switch';
import { AI_CAPABILITIES, AI_STYLES } from '@/features/personalization/catalog';
import { useUpdatePreferences, useViewer } from '@/lib/client/viewer';
import { useWorkstyleSuggestion } from '../workstyle-suggestion';

export function AiStep() {
  const viewer = useViewer();
  const update = useUpdatePreferences();
  const suggests = useWorkstyleSuggestion();
  return (
    <div className="ob-inner a-in" style={{ maxWidth: 1080 }}>
      <span className="lbl">Step 7 · RedSky AI</span>
      <h1 className="ob-h serif">Meet your RedSky AI assistant</h1>
      <p className="ob-sub">RedSky AI is built into every part of the workspace — your Daily Brief, meeting preparation, records and search. It recommends; you decide.</p>
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 20, marginTop: 28, alignItems: 'flex-start' }}>
        <div className="card" style={{ flex: '1 1 340px', padding: '18px 20px' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 6 }}>
            <span className="tile tile-ai">
              <Icon name="ai" />
            </span>
            <div>
              <div style={{ fontWeight: 600 }}>What it helps with</div>
              <div className="faint" style={{ fontSize: 12 }}>
                Status reflects the RedSky roadmap
              </div>
            </div>
          </div>
          <div style={{ display: 'flex', flexDirection: 'column' }}>
            {AI_CAPABILITIES.map((capability) => (
              <div key={capability.label} style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '9px 0', borderBottom: '1px solid var(--bd)' }}>
                <Icon name={capability.icon} size="s" className="faint" />
                <span className="grow" style={{ fontSize: 13 }}>
                  {capability.label}
                </span>
                <span className={capability.live ? 'chip chip-ok' : 'chip chip-o'}>{capability.live ? 'Available in pilot' : 'Planned · Phase 2'}</span>
              </div>
            ))}
          </div>
        </div>
        <div style={{ flex: '1.3 1 400px', display: 'flex', flexDirection: 'column', gap: 10 }}>
          <h2 className="qh">Choose how RedSky AI responds</h2>
          {AI_STYLES.map((style) => (
            <button key={style.id} type="button" className="sel" style={{ padding: '14px 16px' }} aria-pressed={viewer.preferences.aiStyle === style.id} onClick={() => update.mutate({ aiStyle: style.id })}>
              <span className="sel-chk r">
                <Icon name="check" size="xs" strokeWidth={2.6} />
              </span>
              <span style={{ display: 'flex', alignItems: 'baseline', gap: 8, paddingRight: 26, flexWrap: 'wrap' }}>
                <span style={{ fontWeight: 600 }}>{style.label}</span>
                <span className="faint" style={{ fontSize: 12.5 }}>
                  {style.desc}
                </span>
                {suggests('ai', style.id) ? (
                  <span className="chip chip-ai" style={{ height: 18, fontSize: 10.5 }}>
                    Workstyle suggestion
                  </span>
                ) : null}
              </span>
              <span className="ai-box" style={{ fontSize: 12, width: '100%' }}>
                <span className="ai-tag" style={{ marginRight: 6 }}>
                  Sample
                </span>
                {style.sample}
              </span>
            </button>
          ))}
        </div>
      </div>
      <div className="card" style={{ marginTop: 20, padding: '18px 20px', display: 'flex', flexWrap: 'wrap', gap: 20 }}>
        <div style={{ flex: '1 1 320px', display: 'flex', gap: 12 }}>
          <span className="tile" style={{ color: 'var(--ok)' }}>
            <Icon name="shield" />
          </span>
          <div>
            <div style={{ fontWeight: 600, marginBottom: 4 }}>Privacy &amp; access</div>
            <p className="muted" style={{ fontSize: 12.5, lineHeight: 1.55 }}>
              RedSky AI only uses information you’re authorized to access. Any external AI processing must comply with RSM Capital’s security policies. Every answer cites its sources, and anything that changes a record, contact or task waits for your confirmation.
            </p>
          </div>
        </div>
        <div style={{ flex: '1 1 300px', display: 'flex', flexDirection: 'column' }}>
          <div className="setrow" style={{ paddingTop: 0 }}>
            <div className="grow">
              <div style={{ fontSize: 13, fontWeight: 500 }}>Personalize with my email and calendar</div>
              <div className="faint" style={{ fontSize: 11.5 }}>
                Uses connected Microsoft 365 data you can already see
              </div>
            </div>
            <Switch checked={viewer.preferences.aiUseContext} label="Personalize with my email and calendar" onCheckedChange={(on) => update.mutate({ aiUseContext: on })} />
          </div>
          <div className="setrow">
            <div className="grow">
              <div style={{ fontSize: 13, fontWeight: 500 }}>Use approved external research providers</div>
              <div className="faint" style={{ fontSize: 11.5 }}>
                Requires administrator approval
              </div>
            </div>
            <Switch checked={false} label="Use approved external research providers" disabled />
          </div>
          <div className="setrow">
            <div className="grow">
              <div style={{ fontSize: 13, fontWeight: 500 }}>Always show sources</div>
              <div className="faint" style={{ fontSize: 11.5 }}>
                Required by RSM policy
              </div>
            </div>
            <Switch checked label="Always show sources" disabled />
          </div>
        </div>
      </div>
    </div>
  );
}
