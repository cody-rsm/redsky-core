'use client';

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import type { WorkstyleProfile, WorkstyleProfileDraft } from '@/features/workstyle/profile';
import type { WorkstyleDetail, WorkstyleRecommendationChange } from '@/lib/api/contracts';
import { apiFetch, errorMessage } from './api';
import { queryKeys } from './query-client';
import { useUiStore } from './ui-store';

// Assessment data is fetched only while a Workstyle surface is open, and never cached past the session.
export function useWorkstyle(enabled = true) {
  return useQuery({ queryKey: queryKeys.workstyle, queryFn: () => apiFetch<WorkstyleDetail>('/api/workstyle'), enabled, staleTime: 0, gcTime: 60_000 });
}

export function useWorkstyleActions() {
  const client = useQueryClient();
  const toast = useUiStore((state) => state.toast);

  // Workstyle changes can move preferences and the layout, so the viewer and widgets refresh with it.
  const settle = async (detail: WorkstyleDetail | null) => {
    client.setQueryData(queryKeys.workstyle, detail);
    await client.invalidateQueries({ queryKey: queryKeys.viewer });
    await client.invalidateQueries({ queryKey: queryKeys.widgets });
  };

  const upload = useMutation({
    mutationFn: ({ file, consent }: { file: File; consent: boolean }) => {
      const form = new FormData();
      form.set('report', file);
      form.set('consent', String(consent));
      return apiFetch<WorkstyleDetail>('/api/workstyle/upload', { method: 'POST', form });
    },
    onSuccess: settle,
    onError: (error) => toast(errorMessage(error)),
  });

  const startManual = useMutation({
    mutationFn: (consent: boolean) => apiFetch<WorkstyleDetail>('/api/workstyle/manual', { method: 'POST', body: { consent } }),
    onSuccess: settle,
    onError: (error) => toast(errorMessage(error)),
  });

  const startSample = useMutation({
    mutationFn: (consent: boolean) => apiFetch<WorkstyleDetail>('/api/workstyle/sample', { method: 'POST', body: { consent } }),
    onSuccess: async (detail) => {
      await settle(detail);
      toast('Your workstyle insights are ready');
    },
    onError: (error) => toast(errorMessage(error)),
  });

  const saveDraft = useMutation({
    mutationFn: (draft: WorkstyleProfileDraft) => apiFetch<{ ok: true }>('/api/workstyle/draft', { method: 'PUT', body: draft }),
    onError: (error) => toast(`Couldn’t save your edits. ${errorMessage(error)}`),
  });

  const review = useMutation({
    mutationFn: (profile: WorkstyleProfile) => apiFetch<WorkstyleDetail>('/api/workstyle/review', { method: 'POST', body: profile }),
    onSuccess: async (detail) => {
      await settle(detail);
      toast('Your workstyle insights are ready');
    },
    onError: (error) => toast(errorMessage(error)),
  });

  const change = useMutation({
    mutationFn: (body: WorkstyleRecommendationChange) => apiFetch<WorkstyleDetail>('/api/workstyle/recommendations', { method: 'PATCH', body }),
    onMutate: async (body) => {
      await client.cancelQueries({ queryKey: queryKeys.workstyle });
      const previous = client.getQueryData<WorkstyleDetail>(queryKeys.workstyle);
      if (previous) client.setQueryData<WorkstyleDetail>(queryKeys.workstyle, optimisticChange(previous, body));
      return { previous };
    },
    onError: (error, _body, context) => {
      if (context?.previous) client.setQueryData(queryKeys.workstyle, context.previous);
      toast(`Couldn’t update that suggestion. ${errorMessage(error)}`);
    },
    onSuccess: settle,
  });

  const share = useMutation({
    mutationFn: (body: { scope: 'manager' | 'colleagues'; enabled: boolean }) => apiFetch<WorkstyleDetail>('/api/workstyle/sharing', { method: 'PATCH', body: { ...body, consent: body.enabled } }),
    onSuccess: async (detail, body) => {
      client.setQueryData(queryKeys.workstyle, detail);
      toast(body.enabled ? 'Sharing turned on — you can revoke it any time' : 'Sharing turned off');
    },
    onError: (error) => toast(errorMessage(error)),
  });

  const remove = useMutation({
    mutationFn: () => apiFetch<{ ok: true }>('/api/workstyle', { method: 'DELETE' }),
    onSuccess: async () => {
      await client.invalidateQueries({ queryKey: queryKeys.workstyle });
      await client.invalidateQueries({ queryKey: queryKeys.viewer });
      toast('Assessment data removed. Your settings were kept.');
    },
  });

  return { upload, startManual, startSample, saveDraft, review, change, share, remove };
}

function optimisticChange(detail: WorkstyleDetail, body: WorkstyleRecommendationChange): WorkstyleDetail {
  return {
    ...detail,
    recommendations: detail.recommendations.map((recommendation) => {
      if ('acceptAll' in body) return recommendation.status === 'pending' ? { ...recommendation, status: 'accepted' } : recommendation;
      if (recommendation.id !== body.id) return recommendation;
      return { ...recommendation, status: body.status ?? recommendation.status, choice: body.choice ?? recommendation.choice };
    }),
  };
}
