import { describe, expect, it } from 'vitest';
import type { AnswerKey } from '@/features/ai/catalog';
import { actionRequiresConfirmation, aiAnswerSchema } from '@/features/ai/types';
import { DEFAULT_PREFERENCES, DEMO_PERSONA_IDS } from '@/features/preferences/schema';
import { simulatedAnswer } from '@/server/ai/simulated-provider';
import { demoProvider } from '@/server/data/demo/demo-provider';
import type { ProviderContext } from '@/server/data/types';

const KEYS: AnswerKey[] = ['next', 'projects', 'followups', 'pipeline', 'company', 'decisions', 'brief', 'reconnect', 'draft', 'summarize', 'intel', 'module', 'research', 'generic'];

describe('simulated AI provider (demo mode)', () => {
  for (const persona of DEMO_PERSONA_IDS) {
    it(`returns schema-valid answers for every prompt type as ${persona}`, async () => {
      const context: ProviderContext = { actor: { userId: 'u1', accessRole: 'member', teamIds: [] }, userId: 'u1', viewerName: 'Test User', persona, preferences: DEFAULT_PREFERENCES, itemStates: new Map(), openTaskCount: 0 };
      const attention = await demoProvider.externalAttention(context);
      for (const key of KEYS) {
        const answer = simulatedAnswer({ key, ref: key === 'module' ? 'gov' : null, context, attention });
        expect(() => aiAnswerSchema.parse(answer), `${persona}/${key}`).not.toThrow();
        expect(answer.lead.length).toBeGreaterThan(0);
        for (const action of answer.actions ?? []) if (action.kind === 'tasks' || action.kind === 'draft') expect(actionRequiresConfirmation(action)).toBe(true);
      }
    });
  }

  it('marks every data-changing proposal as requiring confirmation', () => {
    expect(actionRequiresConfirmation({ kind: 'tasks', label: 'Create', tasks: [{ title: 'A', related: 'B', due: 'Today' }] })).toBe(true);
    expect(actionRequiresConfirmation({ kind: 'draft', label: 'Draft' })).toBe(true);
    expect(actionRequiresConfirmation({ kind: 'nav', label: 'Open', href: '/pipeline' })).toBe(false);
  });
});
