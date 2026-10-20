'use client';

import { Icon } from '@/components/ui/icon';
import { NAV_GROUPS } from '@/features/navigation/catalog';
import { DEPARTMENT_FOCUS_AREAS, DEPARTMENTS, FOCUS_AREA_WORKFLOWS, FOCUS_AREAS, WIDGETS, type Department, type FocusAreaId } from '@/features/personalization/catalog';
import { recommend } from '@/features/personalization/recommend';
import { useUpdatePreferences, useViewer } from '@/lib/client/viewer';

export function RoleStep() {
  const viewer = useViewer();
  const updatePreferences = useUpdatePreferences();
  const selected = viewer.profile.focusAreas;
  const department = (DEPARTMENTS as ReadonlyArray<string>).includes(viewer.profile.department) ? (viewer.profile.department as Department) : null;
  const suggested = new Set<FocusAreaId>(department ? DEPARTMENT_FOCUS_AREAS[department] : []);

  const toggle = (id: FocusAreaId) => updatePreferences.mutate({ focusAreas: selected.includes(id) ? selected.filter((area) => area !== id) : [...selected, id] });

  const widgets = recommend(selected, viewer.preferences.goals, viewer.preferences.density).ids.slice(0, 5).map((id) => WIDGETS[id].name);
  const modules = ['Home', 'People', 'Projects', ...NAV_GROUPS.flatMap((group) => group.items.filter((item) => item.focusAreas?.some((area) => selected.includes(area))).map((item) => item.label))].slice(0, 7);
  const flows = selected.flatMap((area) => FOCUS_AREA_WORKFLOWS[area]).slice(0, 5);

  return (
    <div className="ob-inner a-in">
      <span className="lbl">Step 3 · Role</span>
      <h1 className="ob-h serif">Which areas of RSM do you work in?</h1>
      <p className="ob-sub">Choose all that apply. This shapes your home page, the modules in your navigation and the workflows RedSky recommends.</p>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill,minmax(min(270px,100%),1fr))', gap: 12, marginTop: 28 }}>
        {FOCUS_AREAS.map((area) => (
          <button key={area.id} type="button" className="sel" aria-pressed={selected.includes(area.id)} onClick={() => toggle(area.id)}>
            <span className="sel-chk">
              <Icon name="check" size="xs" strokeWidth={2.6} />
            </span>
            <span className="tile">
              <Icon name={area.icon} />
            </span>
            <span style={{ fontWeight: 600, fontSize: 14, paddingRight: 24 }}>{area.name}</span>
            <span className="muted" style={{ fontSize: 12.5, lineHeight: 1.45 }}>
              {area.desc}
            </span>
            {suggested.has(area.id) ? (
              <span className="chip chip-o" style={{ alignSelf: 'flex-start' }}>
                Suggested from your department
              </span>
            ) : null}
          </button>
        ))}
      </div>
      <div className="card" style={{ marginTop: 20, padding: '18px 20px', display: 'grid', gridTemplateColumns: 'repeat(auto-fit,minmax(min(240px,100%),1fr))', gap: 18 }}>
        <div>
          <div className="lbl" style={{ marginBottom: 8 }}>
            Home page will feature
          </div>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
            {widgets.map((name) => (
              <span key={name} className="chip">
                {name}
              </span>
            ))}
          </div>
        </div>
        <div>
          <div className="lbl" style={{ marginBottom: 8 }}>
            Navigation will include
          </div>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
            {modules.map((name) => (
              <span key={name} className="chip">
                {name}
              </span>
            ))}
          </div>
        </div>
        <div>
          <div className="lbl" style={{ marginBottom: 8 }}>
            Recommended workflows
          </div>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
            {(flows.length ? flows : ['Select a role to see workflows']).map((name) => (
              <span key={name} className="chip chip-ai">
                {name}
              </span>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
