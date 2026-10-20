'use client';

import { useQuery } from '@tanstack/react-query';
import type { WidgetDataMap, WidgetResponse } from '@/lib/api/contracts';
import { apiFetch } from './api';
import { queryKeys } from './query-client';

export function useWidget<TId extends keyof WidgetDataMap>(id: TId) {
  return useQuery({ queryKey: queryKeys.widget(id), queryFn: () => apiFetch<WidgetResponse<WidgetDataMap[TId]>>(`/api/widgets/${id}`) });
}
