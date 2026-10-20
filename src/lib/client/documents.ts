'use client';

import { useInfiniteQuery, useQuery, useQueryClient } from '@tanstack/react-query';
import { DOCUMENT_STATUS_IN_PROGRESS, type DocumentVisibility } from '@/features/documents/catalog';
import type { DocumentContentView, DocumentListResponse, DocumentRow, DocumentSearchResponse } from '@/lib/api/contracts';
import { apiFetch } from './api';
import { queryKeys } from './query-client';

// Until events arrive the page polls, but only while something is still being read.
const POLL_MS = 4_000;

const isInProgress = (document: DocumentRow) => DOCUMENT_STATUS_IN_PROGRESS.includes(document.status);

export function useDocuments() {
  return useInfiniteQuery({
    queryKey: queryKeys.documents,
    queryFn: ({ pageParam }) => apiFetch<DocumentListResponse>(`/api/documents${pageParam ? `?cursor=${encodeURIComponent(pageParam)}` : ''}`),
    initialPageParam: null as string | null,
    getNextPageParam: (last) => (last.status === 'ok' ? last.nextCursor : null),
    refetchInterval: (query) => (query.state.data?.pages.some((page) => page.status === 'ok' && page.documents.some(isInProgress)) ? POLL_MS : false),
  });
}

export function useDocument(id: string | null) {
  return useQuery({
    queryKey: queryKeys.document(id ?? ''),
    queryFn: () => apiFetch<DocumentRow>(`/api/documents/${encodeURIComponent(id ?? '')}`),
    enabled: Boolean(id),
    retry: false,
    refetchInterval: (query) => (query.state.data && isInProgress(query.state.data) ? POLL_MS : false),
  });
}

export function useDocumentContent(document: DocumentRow | undefined) {
  const ready = document?.status === 'completed' || document?.status === 'needs_review';
  return useQuery({
    queryKey: queryKeys.documentContent(document?.id ?? ''),
    queryFn: () => apiFetch<DocumentContentView>(`/api/documents/${encodeURIComponent(document?.id ?? '')}/content`),
    enabled: Boolean(document && ready && !document.noAi),
    staleTime: 5 * 60_000,
  });
}

export function useDocumentSearch(query: string) {
  const term = query.trim();
  return useQuery({
    queryKey: queryKeys.documentSearch(term),
    queryFn: ({ signal }) => apiFetch<DocumentSearchResponse>(`/api/documents/search?q=${encodeURIComponent(term)}`, { signal }),
    enabled: term.length >= 2,
    staleTime: 30_000,
  });
}

export function useDocumentActions() {
  const client = useQueryClient();

  async function refresh() {
    await Promise.all([client.invalidateQueries({ queryKey: queryKeys.documents }), client.invalidateQueries({ queryKey: queryKeys.widget('documents') })]);
  }

  async function upload(file: File, options: { visibility: DocumentVisibility; related: string }): Promise<DocumentRow> {
    const form = new FormData();
    form.set('file', file);
    form.set('visibility', options.visibility);
    form.set('related', options.related);
    const document = await apiFetch<DocumentRow>('/api/documents', { method: 'POST', form });
    await refresh();
    return document;
  }

  async function retry(id: string): Promise<DocumentRow> {
    const document = await apiFetch<DocumentRow>(`/api/documents/${encodeURIComponent(id)}/retry`, { method: 'POST' });
    client.setQueryData(queryKeys.document(id), document);
    await refresh();
    return document;
  }

  async function remove(id: string): Promise<void> {
    await apiFetch(`/api/documents/${encodeURIComponent(id)}`, { method: 'DELETE' });
    client.removeQueries({ queryKey: queryKeys.document(id) });
    client.removeQueries({ queryKey: queryKeys.documentContent(id) });
    await refresh();
  }

  return { upload, retry, remove };
}
