import { QueryClient } from '@tanstack/react-query';
import { ApiError } from './api';

export function createQueryClient(): QueryClient {
  return new QueryClient({
    defaultOptions: {
      queries: {
        staleTime: 30_000,
        refetchOnWindowFocus: false,
        retry: (failureCount, error) => !(error instanceof ApiError && error.status < 500) && failureCount < 2,
      },
      mutations: { retry: false },
    },
  });
}

export const queryKeys = {
  viewer: ['viewer'] as const,
  widget: (id: string) => ['widget', id] as const,
  widgets: ['widget'] as const,
  record: (kind: string, id: string) => ['record', kind, id] as const,
  prep: (id: string) => ['prep', id] as const,
  notifications: ['notifications'] as const,
  search: (query: string) => ['search', query] as const,
  workstyle: ['workstyle'] as const,
  people: ['people'] as const,
  pipelineBoard: ['pipeline-board'] as const,
};
