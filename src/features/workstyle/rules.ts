import type { WsRecommendationId } from './catalog';
import type { WorkstyleProfile } from './profile';

// Explicit, configurable recommendation rules (no model inference). For each area the first matching rule
// decides the suggested option and produces the "From your assessment" insight from the employee's own values.
// Thresholds live here so policy owners can review and change them in one place.
export const WS_THRESHOLDS = {
  high: 60,
  low: 50,
  poleLean: 60,
} as const;

type Rule = {
  when: (profile: WorkstyleProfile) => boolean;
  choice: string;
  insight: (profile: WorkstyleProfile) => string;
};

const H = WS_THRESHOLDS.high;
const LOW = WS_THRESHOLDS.low;
const LEAN = WS_THRESHOLDS.poleLean;

const d = (p: WorkstyleProfile) => p.disc.D.natural;
const i = (p: WorkstyleProfile) => p.disc.I.natural;
const s = (p: WorkstyleProfile) => p.disc.S.natural;
const c = (p: WorkstyleProfile) => p.disc.C.natural;
const sentence = (text: string) => text.trim().replace(/\.?$/, '.');
const preferenceOr = (text: string, fallback: string, label: string) => (text.trim() ? `${label}: ${sentence(text.trim().charAt(0).toLowerCase() + text.trim().slice(1))}` : fallback);

export const WS_RULES: Record<WsRecommendationId, { rules: ReadonlyArray<Rule>; fallback: Rule }> = {
  layout: {
    rules: [
      { when: (p) => d(p) >= H, choice: 'action', insight: (p) => `High Dominance (D ${d(p)}): tends to focus on results and action.` },
      { when: (p) => i(p) >= H, choice: 'people', insight: (p) => `High Influence (I ${i(p)}): tends to lead with people and relationships.` },
    ],
    fallback: { when: () => true, choice: 'keep', insight: () => 'No strong Dominance or Influence tendency: your current order may already fit.' },
  },
  prep: {
    rules: [
      { when: (p) => i(p) >= H && p.drivingForces.power >= LEAN, choice: 'onepage-15', insight: (p) => `High Influence (I ${i(p)}) with a Commanding driver: tends to be relationship- and outcome-oriented.` },
      { when: (p) => c(p) >= H, choice: 'detailed-30', insight: (p) => `High Compliance (C ${c(p)}): tends to value thorough, accurate preparation.` },
      { when: (p) => i(p) >= H, choice: 'onepage-15', insight: (p) => `High Influence (I ${i(p)}): tends to center meetings on the people and the conversation.` },
    ],
    fallback: { when: () => true, choice: 'onepage-30', insight: () => 'No strong preparation tendency stands out: a short brief with extra lead time is a neutral start.' },
  },
  tasks: {
    rules: [
      { when: (p) => p.drivingForces.methodologies >= LEAN, choice: 'top3', insight: (p) => `Receptive driving force (${p.drivingForces.methodologies}): comfortable adapting methods to the situation.` },
      { when: (p) => p.drivingForces.methodologies <= 100 - LEAN, choice: 'due', insight: (p) => `Structured driving force (${100 - p.drivingForces.methodologies}): tends to prefer proven, orderly methods.` },
    ],
    fallback: { when: () => true, choice: 'top3', insight: () => 'Balanced Methodologies driver: a short daily focus list keeps priorities visible.' },
  },
  comm: {
    rules: [
      { when: (p) => d(p) >= H, choice: 'batched', insight: (p) => preferenceOr(p.preferences.communication, `High Dominance (D ${d(p)}): tends to prefer brief, direct communication.`, 'Communication preference') },
      { when: (p) => s(p) >= H || p.drivingForces.surroundings >= LEAN, choice: 'warm', insight: (p) => `High Steadiness (S ${s(p)}) or a Harmonious driver: tends to value context and rapport.` },
    ],
    fallback: { when: () => true, choice: 'realtime', insight: (p) => preferenceOr(p.preferences.communication, 'No strong communication tendency stands out.', 'Communication preference') },
  },
  ai: {
    rules: [
      { when: (p) => d(p) >= H, choice: 'executive', insight: (p) => preferenceOr(p.preferences.decisionMaking, `High Dominance (D ${d(p)}): tends to decide quickly once the key facts are clear.`, 'Decision-making') },
      { when: (p) => c(p) >= H, choice: 'analytical', insight: (p) => `High Compliance (C ${c(p)}): tends to want the reasoning and the sources.` },
    ],
    fallback: { when: () => true, choice: 'concise', insight: () => 'No strong decision-making tendency stands out: short, actionable answers are a neutral start.' },
  },
  density: {
    rules: [
      { when: (p) => (d(p) >= H || i(p) >= H) && c(p) < LOW, choice: 'focused', insight: (p) => preferenceOr(p.preferences.environment, `Lower Compliance (C ${c(p)}): tends to prefer freedom from routine detail.`, 'Preferred environment') },
      { when: (p) => c(p) >= H, choice: 'comprehensive', insight: (p) => `High Compliance (C ${c(p)}): tends to want the complete picture.` },
    ],
    fallback: { when: () => true, choice: 'balanced', insight: () => 'No strong preference for more or less detail stands out.' },
  },
};

export type WsSuggestion = { id: WsRecommendationId; choice: string; insight: string };

export function suggestFromProfile(profile: WorkstyleProfile): Record<WsRecommendationId, WsSuggestion> {
  const out = {} as Record<WsRecommendationId, WsSuggestion>;
  for (const id of Object.keys(WS_RULES) as WsRecommendationId[]) {
    const { rules, fallback } = WS_RULES[id];
    const rule = rules.find((candidate) => candidate.when(profile)) ?? fallback;
    out[id] = { id, choice: rule.choice, insight: rule.insight(profile) };
  }
  return out;
}
