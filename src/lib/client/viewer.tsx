'use client';

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { createContext, useContext, useEffect, type ReactNode } from 'react';
import { applyPreferencesPatch } from '@/features/preferences/apply';
import type { PreferencesPatch } from '@/features/preferences/schema';
import type { ProfilePatch } from '@/features/profile/schema';
import type { ViewerPayload } from '@/lib/api/contracts';
import { apiFetch, errorMessage } from './api';
import { queryKeys } from './query-client';
import { useUiStore } from './ui-store';

const InitialViewerContext = createContext<ViewerPayload | null>(null);

export function ViewerProvider({ initial, children }: { initial: ViewerPayload; children: ReactNode }) {
  return <InitialViewerContext value={initial}>{children}</InitialViewerContext>;
}

export function useViewer(): ViewerPayload {
  const initial = useContext(InitialViewerContext);
  if (!initial) throw new Error('useViewer must be used within ViewerProvider');
  const query = useQuery({ queryKey: queryKeys.viewer, queryFn: () => apiFetch<ViewerPayload>('/api/me'), initialData: initial, staleTime: Infinity });
  return query.data;
}

export function applyTheme(theme: 'light' | 'dark') {
  document.documentElement.dataset.theme = theme;
}

// The first paint uses the theme cookie; on a new browser that cookie is missing, so align it with the
// saved preference once the viewer is known.
export function useThemeSync(theme: 'light' | 'dark') {
  useEffect(() => {
    if (document.documentElement.dataset.theme === theme) return;
    applyTheme(theme);
    document.cookie = `redsky_theme=${theme}; path=/; max-age=31536000; samesite=lax${window.location.protocol === 'https:' ? '; secure' : ''}`;
  }, [theme]);
}

type PreferencesResponse = Pick<ViewerPayload, 'preferences' | 'layout'> & { focusAreas: ViewerPayload['profile']['focusAreas'] };

// Optimistic: the UI changes immediately (same transition the server runs), then the server's answer wins.
export function useUpdatePreferences() {
  const client = useQueryClient();
  const toast = useUiStore((state) => state.toast);
  return useMutation({
    mutationFn: (patch: PreferencesPatch) => apiFetch<PreferencesResponse>('/api/me/preferences', { method: 'PATCH', body: patch }),
    onMutate: async (patch) => {
      await client.cancelQueries({ queryKey: queryKeys.viewer });
      const previous = client.getQueryData<ViewerPayload>(queryKeys.viewer);
      if (previous) {
        const next = applyPreferencesPatch({ preferences: previous.preferences, layout: previous.layout, focusAreas: previous.profile.focusAreas }, patch);
        client.setQueryData<ViewerPayload>(queryKeys.viewer, { ...previous, preferences: next.preferences, layout: next.layout, profile: { ...previous.profile, focusAreas: next.focusAreas } });
        if (patch.theme) applyTheme(patch.theme);
      }
      return { previous };
    },
    onError: (error, _patch, context) => {
      if (context?.previous) {
        client.setQueryData(queryKeys.viewer, context.previous);
        applyTheme(context.previous.preferences.theme);
      }
      toast(`Couldn’t save that change. ${errorMessage(error)}`);
    },
    onSuccess: (data) => {
      client.setQueryData<ViewerPayload>(queryKeys.viewer, (current) => (current ? { ...current, preferences: data.preferences, layout: data.layout, profile: { ...current.profile, focusAreas: data.focusAreas } } : current));
      if (data) client.invalidateQueries({ queryKey: queryKeys.widgets });
    },
  });
}

export function useUpdateProfile() {
  const client = useQueryClient();
  const toast = useUiStore((state) => state.toast);
  return useMutation({
    mutationFn: (patch: ProfilePatch) => apiFetch<{ ok: true }>('/api/me/profile', { method: 'PATCH', body: patch }),
    onMutate: async (patch) => {
      await client.cancelQueries({ queryKey: queryKeys.viewer });
      const previous = client.getQueryData<ViewerPayload>(queryKeys.viewer);
      if (previous) client.setQueryData<ViewerPayload>(queryKeys.viewer, { ...previous, profile: { ...previous.profile, ...patch } });
      return { previous };
    },
    onError: (error, _patch, context) => {
      if (context?.previous) client.setQueryData(queryKeys.viewer, context.previous);
      toast(`Couldn’t save your profile. ${errorMessage(error)}`);
    },
  });
}

export function useRefreshViewer() {
  const client = useQueryClient();
  return () => client.invalidateQueries({ queryKey: queryKeys.viewer });
}
