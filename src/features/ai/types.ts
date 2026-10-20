import { z } from 'zod';

export const RECORD_KINDS = ['contact', 'company', 'deal', 'project', 'doc', 'meeting', 'task'] as const;
export type RecordKind = (typeof RECORD_KINDS)[number];

export const sourceRefSchema = z.object({ kind: z.enum(RECORD_KINDS), id: z.string().max(200), label: z.string().max(300) });
export type SourceRef = z.infer<typeof sourceRefSchema>;

export const proposedTaskSchema = z.object({
  title: z.string().trim().min(1).max(300),
  related: z.string().trim().max(200).optional(),
  due: z.string().trim().max(40).optional(),
});
export type ProposedTask = z.infer<typeof proposedTaskSchema>;

// Navigation actions run client-side; everything else changes data and requires explicit confirmation plus a
// server-side authorization check before it runs (SPEC §1 "Human confirmation").
export const proposedActionSchema = z.discriminatedUnion('kind', [
  z.object({ kind: z.literal('prep'), label: z.string(), desc: z.string().optional(), meetingId: z.string() }),
  z.object({ kind: z.literal('nav'), label: z.string(), desc: z.string().optional(), href: z.string() }),
  z.object({ kind: z.literal('preview'), label: z.string(), desc: z.string().optional(), record: sourceRefSchema.pick({ kind: true, id: true }) }),
  z.object({ kind: z.literal('tasks'), label: z.string(), desc: z.string().optional(), tasks: z.array(proposedTaskSchema).min(1).max(10) }),
  z.object({ kind: z.literal('draft'), label: z.string(), desc: z.string().optional() }),
  z.object({ kind: z.literal('doc'), label: z.string(), desc: z.string().optional() }),
]);
export type ProposedAction = z.infer<typeof proposedActionSchema>;

export function actionRequiresConfirmation(action: ProposedAction): boolean {
  return action.kind === 'tasks' || action.kind === 'draft' || action.kind === 'doc';
}

// Structured answer. The simulated provider fills every field; a model provider fills `lead` (and may add
// bullets, sources and actions). Rendering per response style happens in the client.
export const aiAnswerSchema = z.object({
  bottomLine: z.string().optional(),
  short: z.string().optional(),
  lead: z.string(),
  bullets: z.array(z.string()).default([]),
  reasoning: z.string().optional(),
  draft: z.string().optional(),
  sources: z.array(sourceRefSchema).default([]),
  actions: z.array(proposedActionSchema).default([]),
});
export type AiAnswer = z.infer<typeof aiAnswerSchema>;

export type AiProviderKind = 'simulated' | 'anthropic' | 'unavailable';
