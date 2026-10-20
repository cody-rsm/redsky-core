import type { FocusAreaId } from '@/features/personalization/catalog';
import { recommend } from '@/features/personalization/recommend';
import type { DashboardLayout, PreferencesPatch, WorkspacePreferences } from './schema';

export type PreferencesState = { preferences: WorkspacePreferences; layout: DashboardLayout; focusAreas: FocusAreaId[] };

// Pure transition shared by the server (authoritative) and the client (optimistic updates): applies a patch and
// keeps the recommended layout in sync with focus areas, goals and density until the employee arranges widgets
// by hand (SPEC §5.3).
export function applyPreferencesPatch(current: PreferencesState, patch: PreferencesPatch): PreferencesState {
  const { focusAreas: nextFocus, layout: nextLayout, layoutTouched, resetLayout, ...preferencePatch } = patch;
  const preferences: WorkspacePreferences = { ...current.preferences, ...preferencePatch };
  const focusAreas = nextFocus ?? current.focusAreas;
  let layout = current.layout;
  if (resetLayout) {
    layout = { layout: recommend(focusAreas, preferences.goals, preferences.density).layout, layoutTouched: false };
  } else if (nextLayout) {
    layout = { layout: nextLayout, layoutTouched: layoutTouched ?? true };
  } else {
    const inputsChanged = nextFocus !== undefined || preferencePatch.goals !== undefined || preferencePatch.density !== undefined;
    if (inputsChanged && !current.layout.layoutTouched) {
      layout = { layout: recommend(focusAreas, preferences.goals, preferences.density).layout, layoutTouched: false };
    } else if (layoutTouched !== undefined) {
      layout = { ...layout, layoutTouched };
    }
  }
  return { preferences, layout, focusAreas };
}
