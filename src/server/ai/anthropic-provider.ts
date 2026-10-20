import 'server-only';
import Anthropic from '@anthropic-ai/sdk';
import { betaZodOutputFormat } from '@anthropic-ai/sdk/helpers/beta/zod';
import { z } from 'zod';
import type { AiAnswer } from '@/features/ai/types';
import { getConfig } from '@/server/config/env';
import { HttpError } from '@/server/http/errors';
import { logger } from '@/server/logging/logger';
import { SYSTEM_PROMPT } from './prompts';
import type { RetrievedContext } from './context';

// Structured output keeps the answer machine-readable: proposals arrive as data (never executed tool calls),
// and the history replays as plain text, so no thinking blocks are ever re-sent between turns.
const answerSchema = z.object({
  bottomLine: z.string(),
  lead: z.string(),
  bullets: z.array(z.string()),
  reasoning: z.string(),
  proposedTasks: z.array(z.object({ title: z.string(), related: z.string(), due: z.string() })),
  sourceTaskIds: z.array(z.string()),
});

export type ModelTurn = { role: 'user' | 'assistant'; text: string };

let client: Anthropic | null = null;

function getClient(): Anthropic {
  const { ai } = getConfig();
  if (!ai.apiKey) throw new HttpError(409, 'unavailable', 'RedSky AI is not configured yet.');
  client ??= new Anthropic({ apiKey: ai.apiKey, timeout: 90_000, maxRetries: 2 });
  return client;
}

export function composeUserTurn(question: string, style: string, context: RetrievedContext): string {
  return `<context>${context.serialized}</context>\n<response_style>${style}</response_style>\n<question>${question}</question>`;
}

export async function anthropicAnswer(history: ModelTurn[], userTurn: string, context: RetrievedContext): Promise<{ answer: AiAnswer; raw: string; model: string }> {
  const { ai } = getConfig();
  const messages: Anthropic.Beta.BetaMessageParam[] = [...history.map((turn) => ({ role: turn.role, content: turn.text })), { role: 'user', content: userTurn }];
  try {
    const response = await getClient().beta.messages.parse({
      model: ai.model,
      max_tokens: 16000,
      // Server-side fallback re-runs a policy-declined request on the platform's default fallback model.
      betas: ['server-side-fallback-2026-07-01'],
      fallbacks: 'default',
      thinking: { type: 'adaptive' },
      output_config: { effort: ai.effort, format: betaZodOutputFormat(answerSchema) },
      system: SYSTEM_PROMPT,
      messages,
    });
    if (response.stop_reason === 'refusal') {
      return { answer: { lead: 'RedSky AI can’t help with that request.', bullets: [], sources: [], actions: [] }, raw: '', model: response.model };
    }
    const parsed = response.parsed_output;
    if (!parsed) throw new Error('Model returned no structured output');
    const raw = response.content.flatMap((block) => (block.type === 'text' ? [block.text] : [])).join('');
    const sources = parsed.sourceTaskIds.filter((id) => context.taskIds.has(id)).slice(0, 8).map((id) => ({ kind: 'task' as const, id, label: context.taskTitles.get(id) ?? 'Task' }));
    const tasks = parsed.proposedTasks.slice(0, 5).filter((task) => task.title.trim());
    return {
      answer: {
        bottomLine: parsed.bottomLine || undefined,
        short: parsed.bottomLine || undefined,
        lead: parsed.lead,
        bullets: parsed.bullets.slice(0, 6),
        reasoning: parsed.reasoning || undefined,
        sources,
        actions: tasks.length
          ? [{ kind: 'tasks', label: `Add ${tasks.length} ${tasks.length === 1 ? 'task' : 'tasks'} to My Tasks`, desc: tasks.map((task) => task.title).join(' · '), tasks: tasks.map((task) => ({ title: task.title.slice(0, 300), related: task.related.slice(0, 200), due: task.due.slice(0, 40) })) }]
          : [],
      },
      raw,
      model: response.model,
    };
  } catch (error) {
    if (error instanceof Anthropic.RateLimitError) throw new HttpError(429, 'rate_limited', 'RedSky AI is busy. Please try again in a moment.');
    if (error instanceof Anthropic.AuthenticationError) {
      logger.error('Anthropic authentication failed');
      throw new HttpError(503, 'unavailable', 'RedSky AI is not available right now.');
    }
    if (error instanceof Anthropic.APIError) {
      logger.error('Anthropic API error', { status: error.status });
      throw new HttpError(502, 'upstream_error', 'RedSky AI could not answer just now. Please try again.');
    }
    throw error;
  }
}
