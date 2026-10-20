'use client';

import { Avatar, normalizeTone } from '@/components/ui/avatar';
import { Icon, type IconName } from '@/components/ui/icon';
import { Kbd } from '@/components/ui/kbd';
import { RedSkyMark } from '@/components/ui/redsky-mark';
import { AI_STYLES, DENSITIES, FOCUS_AREA_SHORT, LANDINGS, WIDGETS } from '@/features/personalization/catalog';
import { WS_RECOMMENDATION_IDS } from '@/features/workstyle/catalog';
import { useConnectorActions } from '@/lib/client/integrations';
import { useViewer } from '@/lib/client/viewer';
import { dayContext, viewerDisplay } from '@/lib/client/viewer-display';
import type { StepNavigation } from '../onboarding-flow';

const PREVIEW_NAV: ReadonlyArray<IconName> = ['home', 'tasks', 'people', 'folder', 'capitol', 'doc'];

export function ReadyStep({ navigation }: { navigation: StepNavigation }) {
  const viewer = useViewer();
  const display = viewerDisplay(viewer);
  const { counts } = useConnectorActions();
  const { todayLabel, greeting } = dayContext(viewer);
  const { preferences, profile, layout, workstyle } = viewer;
  const rolesLabel = profile.focusAreas.length ? profile.focusAreas.map((area) => FOCUS_AREA_SHORT[area]).join(', ') : 'your role';
  const landing = LANDINGS.find((entry) => entry.id === preferences.landing) ?? LANDINGS[0];
  const density = DENSITIES.find((entry) => entry.id === preferences.density) ?? DENSITIES[1];
  const aiStyle = AI_STYLES.find((entry) => entry.id === preferences.aiStyle) ?? AI_STYLES[0];

  const summary: ReadonlyArray<{ icon: IconName; label: string; value: string; step: number }> = [
    { icon: 'user', label: 'Profile', value: `${display.fullName}${profile.title ? ` · ${profile.title}` : ''}`, step: 1 },
    { icon: 'crown', label: 'Focus areas', value: rolesLabel, step: 2 },
    {
      icon: 'compass',
      label: 'Workstyle',
      value: workstyle.present ? (workstyle.reviewed ? `${workstyle.acceptedCount} of ${WS_RECOMMENDATION_IDS.length} suggestions accepted · private to you` : 'Scores waiting for your review · private to you') : 'Skipped — add later in Settings',
      step: 3,
    },
    { icon: 'plug', label: 'Connectors', value: `Coming soon · ${counts.notify} on your notify list`, step: 4 },
    { icon: 'sun', label: 'Opens to', value: `${landing?.label ?? ''} · ${density?.label ?? ''}`, step: 5 },
    { icon: 'ai', label: 'RedSky AI', value: `${aiStyle?.label ?? ''} responses`, step: 6 },
    { icon: 'layout', label: 'Home page', value: `${layout.layout.length} widgets`, step: 7 },
  ];

  return (
    <div className="a-in" style={{ maxWidth: 1180, margin: '0 auto', padding: '48px 40px', display: 'grid', gridTemplateColumns: 'repeat(auto-fit,minmax(min(420px,100%),1fr))', gap: 44, alignItems: 'center' }}>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 18 }}>
        <span className="chip chip-ok" style={{ alignSelf: 'flex-start' }}>
          <Icon name="check" size="xs" strokeWidth={2.6} />
          Setup complete
        </span>
        <h1 className="serif" style={{ fontSize: 46, lineHeight: 1.06 }}>
          Your RedSky workspace is ready.
        </h1>
        <p style={{ fontSize: 16, color: 'var(--tx2)', lineHeight: 1.55 }}>Everything you need to stay informed, connected, and moving forward.</p>
        <div className="card" style={{ padding: '4px 16px' }}>
          {summary.map((row) => (
            <div key={row.label} className="setrow" style={{ padding: '10px 0', gap: 12 }}>
              <Icon name={row.icon} size="s" className="faint" />
              <span className="faint" style={{ width: 104, flex: 'none', fontSize: 12.5 }}>
                {row.label}
              </span>
              <span className="grow" style={{ fontSize: 13 }}>
                {row.value}
              </span>
              <button type="button" className="link" style={{ fontSize: 12 }} onClick={() => navigation.goTo(row.step)} aria-label={`Edit ${row.label}`}>
                Edit
              </button>
            </div>
          ))}
        </div>
        <div style={{ display: 'flex', gap: 12, alignItems: 'center', flexWrap: 'wrap', marginTop: 4 }}>
          <button type="button" className="btn btn-p btn-lg" onClick={navigation.next}>
            Enter RedSky
            <Icon name="arrowR" />
          </button>
          <span className="faint" style={{ fontSize: 12.5, display: 'inline-flex', gap: 6, alignItems: 'center' }}>
            Tip: press <Kbd>⌘</Kbd>
            <Kbd>K</Kbd> anywhere to search
          </span>
        </div>
      </div>
      <div aria-hidden="true" style={{ border: '1px solid var(--bd)', borderRadius: 14, background: 'var(--sf)', boxShadow: 'var(--shl)', overflow: 'hidden', display: 'flex', minHeight: 380 }}>
        <div style={{ width: 64, background: 'var(--sb)', borderRight: '1px solid var(--bd)', padding: '12px 10px', display: 'flex', flexDirection: 'column', gap: 8, alignItems: 'center' }}>
          <RedSkyMark size={24} withHorizon={false} />
          {PREVIEW_NAV.map((icon, index) => (
            <span key={icon} style={{ width: 28, height: 22, borderRadius: 6, display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'var(--tx3)', background: index === 0 ? 'var(--sf)' : 'transparent' }}>
              <Icon name={icon} size="xs" />
            </span>
          ))}
        </div>
        <div style={{ flex: 1, minWidth: 0, display: 'flex', flexDirection: 'column' }}>
          <div style={{ height: 34, borderBottom: '1px solid var(--bd)', display: 'flex', alignItems: 'center', padding: '0 12px', gap: 8 }}>
            <span className="sk" style={{ width: 120, height: 14, borderRadius: 5, background: 'var(--bg)', border: '1px solid var(--bd)' }} />
            <span className="grow" />
            <Avatar initials={display.initials} tone={normalizeTone(display.tone)} size="sm" photoUrl={display.photoUrl} />
          </div>
          <div style={{ padding: 14, display: 'flex', flexDirection: 'column', gap: 10, background: 'var(--bg)', flex: 1 }}>
            <div style={{ border: '1px solid var(--bd)', borderRadius: 9, background: 'var(--sf)', padding: 12 }}>
              <span className="lbl" style={{ fontSize: 9 }}>
                Daily Brief · {todayLabel}
              </span>
              <div className="serif" style={{ fontSize: 22, marginTop: 4 }}>
                {greeting}, {display.greetingName}.
              </div>
              <span className="sk" style={{ display: 'block', width: '86%', marginTop: 8 }} />
              <span className="sk" style={{ display: 'block', width: '60%', marginTop: 5 }} />
            </div>
            <div className="mg">
              {layout.layout
                .filter((item) => item.id !== 'brief')
                .map((item) => (
                  <div key={item.id} className={`mb mg-${item.size}`} style={{ cursor: 'default', minHeight: 52 }}>
                    <span style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
                      <Icon name={WIDGETS[item.id].icon} size="xs" style={{ flex: 'none' }} />
                      <span className="ell">{WIDGETS[item.id].name}</span>
                    </span>
                    <span className="sk" style={{ width: '70%', height: 4 }} />
                    <span className="sk" style={{ width: '45%', height: 4 }} />
                  </div>
                ))}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
