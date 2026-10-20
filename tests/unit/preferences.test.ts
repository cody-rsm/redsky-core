import { describe, expect, it } from 'vitest';
import { applyPreferencesPatch, type PreferencesState } from '@/features/preferences/apply';
import { DEFAULT_PREFERENCES } from '@/features/preferences/schema';
import { recommend } from '@/features/personalization/recommend';

const base = (): PreferencesState => {
  const focusAreas = ['ga' as const];
  return { focusAreas, preferences: { ...DEFAULT_PREFERENCES }, layout: { layout: recommend(focusAreas, [], DEFAULT_PREFERENCES.density).layout, layoutTouched: false } };
};

describe('applyPreferencesPatch', () => {
  it('applies scalar preferences without touching the layout', () => {
    const current = base();
    const next = applyPreferencesPatch(current, { theme: 'dark', aiStyle: 'concise' });
    expect(next.preferences.theme).toBe('dark');
    expect(next.preferences.aiStyle).toBe('concise');
    expect(next.layout).toEqual(current.layout);
  });

  it('re-recommends an untouched layout when focus areas change', () => {
    const next = applyPreferencesPatch(base(), { focusAreas: ['vc'] });
    expect(next.layout.layout).toEqual(recommend(['vc'], [], DEFAULT_PREFERENCES.density).layout);
  });

  it('keeps a layout the employee arranged themselves', () => {
    const custom = applyPreferencesPatch(base(), { layout: [{ id: 'team', size: 4 }], layoutTouched: true });
    const next = applyPreferencesPatch(custom, { focusAreas: ['vc'] });
    expect(next.layout.layout).toEqual([{ id: 'team', size: 4 }]);
  });

  it('resets to the recommendation on request', () => {
    const custom = applyPreferencesPatch(base(), { layout: [{ id: 'team', size: 4 }], layoutTouched: true });
    const next = applyPreferencesPatch(custom, { resetLayout: true });
    expect(next.layout.layoutTouched).toBe(false);
    expect(next.layout.layout).toEqual(recommend(['ga'], [], DEFAULT_PREFERENCES.density).layout);
  });
});
