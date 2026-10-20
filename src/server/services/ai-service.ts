import 'server-only';
import { and, asc, desc, eq, gt } from 'drizzle-orm';
import { z } from 'zod';
import { matchAnswerKey, type AnswerKey } from '@/features/ai/catalog';
import { aiAnswerSchema, type AiAnswer, type AiProviderKind } from '@/features/ai/types';
import { AI_STYLE_IDS } from '@/features/personalization/catalog';
import type { AiConversationView, AiMessageView } from '@/lib/api/contracts';
import { anthropicAnswer, composeUserTurn, type ModelTurn } from '@/server/ai/anthropic-provider';
import { retrieveContext } from '@/server/ai/context';
import { simulatedAnswer } from '@/server/ai/simulated-provider';
import { getConfig } from '@/server/config/env';
import type { ProviderContext } from '@/server/data/types';
import { getDb } from '@/server/db/client';
import { aiActionExecutions, aiConversations, aiMessages } from '@/server/db/schema';
import { notFound, unavailable } from '@/server/http/errors';
import { assertAuthorized } from '@/server/security/access-policy';
import { attentionItems } from './workspace-service';

export const askSchema = z.object({
  question: z.string().trim().min(1).max(2000),
  key: z.string().max(40).optional(),
  ref: z.string().max(200).nullable().optional(),
  conversationId: z.string().uuid().nullable().optional(),
  style: z.enum(AI_STYLE_IDS).optional(),
});
export type AskInput = z.infer<typeof askSchema>;

const ANSWER_KEYS: ReadonlyArray<AnswerKey> = ['next', 'projects', 'followups', 'pipeline', 'company', 'decisions', 'brief', 'reconnect', 'draft', 'summarize', 'intel', 'module', 'research', 'generic'];
const RECENT_CONVERSATION_MS = 12 * 3600 * 1000;
const MAX_HISTORY_TURNS = 20;

export function activeAiProvider(): Exclude<AiProviderKind, 'unavailable'> | null {
  const config = getConfig();
  if (config.dataMode === 'demo') return 'simulated';
  if (config.ai.provider === 'anthropic') return 'anthropic';
  return null;
}

type StoredUserContent = { text: string; modelInput?: string };
type StoredAssistantContent = AiAnswer & { raw?: string };

async function ownedConversation(context: ProviderContext, conversationId: string) {
  const [conversation] = await getDb().select().from(aiConversations).where(and(eq(aiConversations.id, conversationId), eq(aiConversations.userId, context.userId))).limit(1);
  if (!conversation) throw notFound('Conversation not found');
  return conversation;
}

async function messageViews(conversationId: string, userId: string): Promise<AiMessageView[]> {
  const rows = await getDb().select().from(aiMessages).where(eq(aiMessages.conversationId, conversationId)).orderBy(asc(aiMessages.createdAt));
  const executions = await getDb().select({ actionKey: aiActionExecutions.actionKey }).from(aiActionExecutions).where(eq(aiActionExecutions.userId, userId));
  const done = new Set(executions.map((row) => row.actionKey));
  return rows.map((row): AiMessageView => {
    if (row.role === 'user') return { id: row.id, role: 'user', text: (row.content as StoredUserContent).text, createdAt: row.createdAt.toISOString() };
    const answer = aiAnswerSchema.parse(row.content);
    return {
      id: row.id,
      role: 'assistant',
      answer,
      style: row.style ?? 'concise',
      provider: row.model ? 'anthropic' : 'simulated',
      model: row.model,
      createdAt: row.createdAt.toISOString(),
      completedActions: answer.actions.flatMap((_, index) => (done.has(`ai:${row.id}:${index}`) ? [index] : [])),
    };
  });
}

export async function latestConversation(context: ProviderContext): Promise<AiConversationView> {
  assertAuthorized(context.actor, 'read', { type: 'own', ownerId: context.userId });
  const provider = activeAiProvider();
  if (!provider) return { id: null, provider: 'unavailable', messages: [] };
  const [conversation] = await getDb()
    .select()
    .from(aiConversations)
    .where(and(eq(aiConversations.userId, context.userId), eq(aiConversations.provider, provider), gt(aiConversations.updatedAt, new Date(Date.now() - RECENT_CONVERSATION_MS))))
    .orderBy(desc(aiConversations.updatedAt))
    .limit(1);
  if (!conversation) return { id: null, provider, messages: [] };
  return { id: conversation.id, provider, messages: await messageViews(conversation.id, context.userId) };
}

export async function askAi(context: ProviderContext, input: AskInput): Promise<AiConversationView> {
  assertAuthorized(context.actor, 'write', { type: 'own', ownerId: context.userId });
  const provider = activeAiProvider();
  if (!provider) throw unavailable('RedSky AI is not configured yet. An administrator needs to connect an approved AI provider.');
  const style = input.style ?? context.preferences.aiStyle;

  let conversationId = input.conversationId ?? null;
  if (conversationId) {
    const conversation = await ownedConversation(context, conversationId);
    if (conversation.provider !== provider) conversationId = null;
  }
  if (!conversationId) {
    const [created] = await getDb().insert(aiConversations).values({ userId: context.userId, provider, title: input.question.slice(0, 120) }).returning({ id: aiConversations.id });
    if (!created) throw new Error('Could not create conversation');
    conversationId = created.id;
  }

  let answer: AiAnswer;
  let model: string | null = null;
  let userContent: StoredUserContent = { text: input.question };
  let raw: string | undefined;
  if (provider === 'simulated') {
    const key = input.key && (ANSWER_KEYS as ReadonlyArray<string>).includes(input.key) ? (input.key as AnswerKey) : matchAnswerKey(input.question);
    answer = simulatedAnswer({ key, ref: input.ref ?? null, context, attention: await attentionItems(context) });
  } else {
    const retrieved = await retrieveContext(context);
    const userTurn = composeUserTurn(input.question, style, retrieved);
    const history = await modelHistory(conversationId);
    const result = await anthropicAnswer(history, userTurn, retrieved);
    answer = result.answer;
    model = result.model;
    raw = result.raw;
    userContent = { text: input.question, modelInput: userTurn };
  }

  await getDb().insert(aiMessages).values({ conversationId, role: 'user', content: userContent });
  await getDb().insert(aiMessages).values({ conversationId, role: 'assistant', content: { ...answer, raw } satisfies StoredAssistantContent, style, model });
  await getDb().update(aiConversations).set({ updatedAt: new Date() }).where(eq(aiConversations.id, conversationId));
  return { id: conversationId, provider, messages: await messageViews(conversationId, context.userId) };
}

// Replays earlier turns exactly as they were sent (append-only), as text only.
async function modelHistory(conversationId: string): Promise<ModelTurn[]> {
  const rows = await getDb().select().from(aiMessages).where(eq(aiMessages.conversationId, conversationId)).orderBy(asc(aiMessages.createdAt));
  const turns: ModelTurn[] = rows.flatMap((row): ModelTurn[] => {
    if (row.role === 'user') {
      const content = row.content as StoredUserContent;
      return [{ role: 'user', text: content.modelInput ?? content.text }];
    }
    const content = row.content as StoredAssistantContent;
    return [{ role: 'assistant', text: content.raw || content.lead }];
  });
  return turns.slice(-MAX_HISTORY_TURNS * 2);
}
