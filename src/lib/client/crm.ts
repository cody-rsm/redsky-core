'use client';

import { useQueryClient } from '@tanstack/react-query';
import type { ContactInput } from '@/features/crm/schema';
import type { CrmContactReview, CrmWriteResult } from '@/lib/api/contracts';
import { apiFetch } from './api';
import { queryKeys } from './query-client';

export type ContactChoice = { organizationId: string | null; createOrganization: boolean };
export type NoteTarget = { kind: 'contact' | 'company'; id: string; label: string };

export function useCrmWrites() {
  const queryClient = useQueryClient();
  return {
    reviewContact: (input: ContactInput) => apiFetch<CrmContactReview>('/api/crm/contacts/review', { method: 'POST', body: input }),
    async addContact(input: ContactInput, choice: ContactChoice, requestKey: string) {
      const result = await apiFetch<CrmWriteResult>('/api/crm/contacts', { method: 'POST', body: { ...input, ...choice, requestKey } });
      await queryClient.invalidateQueries({ queryKey: queryKeys.people });
      return result;
    },
    async addNote(target: NoteTarget, note: { title?: string; body: string }, requestKey: string) {
      const result = await apiFetch<CrmWriteResult>('/api/crm/notes', { method: 'POST', body: { target: { kind: target.kind, id: target.id }, ...note, requestKey } });
      await queryClient.invalidateQueries({ queryKey: queryKeys.record(target.kind, target.id) });
      return result;
    },
  };
}
