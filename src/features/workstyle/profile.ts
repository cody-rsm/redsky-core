import { z } from 'zod';
import { DISC_FACTORS, DRIVING_FORCE_SCALES, type DiscKey, type DrivingForceKey } from './catalog';

const score = z.number().int().min(0).max(100);
const discScore = z.object({ natural: score, adapted: score });
const preferenceText = z.string().trim().max(280);

// The structured, validated assessment. Values are the employee's reviewed figures — never inferred defaults.
export const workstyleProfileSchema = z.object({
  disc: z.object({ D: discScore, I: discScore, S: discScore, C: discScore }),
  drivingForces: z.object({
    knowledge: score,
    utility: score,
    surroundings: score,
    others: score,
    power: score,
    methodologies: score,
  }),
  preferences: z.object({
    communication: preferenceText,
    decisionMaking: preferenceText,
    motivation: preferenceText,
    environment: preferenceText,
  }),
});

export type WorkstyleProfile = z.infer<typeof workstyleProfileSchema>;

// A draft can be incomplete while the employee reviews extraction results.
export const workstyleProfileDraftSchema = z.object({
  disc: z.object({
    D: z.object({ natural: score.nullable(), adapted: score.nullable() }),
    I: z.object({ natural: score.nullable(), adapted: score.nullable() }),
    S: z.object({ natural: score.nullable(), adapted: score.nullable() }),
    C: z.object({ natural: score.nullable(), adapted: score.nullable() }),
  }),
  drivingForces: z.object({
    knowledge: score.nullable(),
    utility: score.nullable(),
    surroundings: score.nullable(),
    others: score.nullable(),
    power: score.nullable(),
    methodologies: score.nullable(),
  }),
  preferences: z.object({
    communication: preferenceText,
    decisionMaking: preferenceText,
    motivation: preferenceText,
    environment: preferenceText,
  }),
});
export type WorkstyleProfileDraft = z.infer<typeof workstyleProfileDraftSchema>;

export function emptyProfileDraft(): WorkstyleProfileDraft {
  return {
    disc: { D: { natural: null, adapted: null }, I: { natural: null, adapted: null }, S: { natural: null, adapted: null }, C: { natural: null, adapted: null } },
    drivingForces: { knowledge: null, utility: null, surroundings: null, others: null, power: null, methodologies: null },
    preferences: { communication: '', decisionMaking: '', motivation: '', environment: '' },
  };
}

export type DrivingForceView = { key: DrivingForceKey; motivator: string; left: string; right: string; position: number; leftStrong: boolean; rightStrong: boolean };

export function drivingForceViews(profile: WorkstyleProfile): DrivingForceView[] {
  return DRIVING_FORCE_SCALES.map((scale) => {
    const position = profile.drivingForces[scale.key];
    return { key: scale.key, motivator: scale.motivator, left: scale.left, right: scale.right, position, leftStrong: position < 50, rightStrong: position >= 50 };
  });
}

// Primary drivers = the four poles furthest from neutral (ties keep scale order).
export function primaryDrivers(profile: WorkstyleProfile, count = 4): string[] {
  return DRIVING_FORCE_SCALES.map((scale, index) => {
    const position = profile.drivingForces[scale.key];
    return { pole: position >= 50 ? scale.right : scale.left, strength: Math.abs(position - 50), index };
  })
    .sort((a, b) => b.strength - a.strength || a.index - b.index)
    .slice(0, count)
    .map((entry) => entry.pole);
}

const NATURAL_DESCRIPTOR: Record<DiscKey, string> = { D: 'direct', I: 'persuasive', S: 'steady', C: 'precise' };
const ADAPTED_DESCRIPTOR: Record<DiscKey, string> = { D: 'drive', I: 'people focus', S: 'steadiness', C: 'structure' };

// A plain-language note built only from the scores; worded as tendencies (SPEC §7.1 rule 5).
export function discStyleNote(profile: WorkstyleProfile): string {
  const natural = [...DISC_FACTORS]
    .map((factor) => ({ key: factor.key, value: profile.disc[factor.key].natural }))
    .sort((a, b) => b.value - a.value)
    .slice(0, 2)
    .map((entry) => NATURAL_DESCRIPTOR[entry.key]);
  const shifts = [...DISC_FACTORS]
    .map((factor) => ({ key: factor.key, delta: profile.disc[factor.key].adapted - profile.disc[factor.key].natural }))
    .filter((entry) => entry.delta >= 5)
    .sort((a, b) => b.delta - a.delta)
    .map((entry) => ADAPTED_DESCRIPTOR[entry.key]);
  const lead = `Natural style leans ${natural.join(' and ')}`;
  if (shifts.length === 0) return `${lead}; the adapted style at work stays close to it.`;
  return `${lead}; the adapted style shows slightly more ${shifts.slice(0, 2).join(' and ')} at work.`;
}

export function isCompleteDraft(draft: WorkstyleProfileDraft): boolean {
  return workstyleProfileSchema.safeParse(draft).success;
}
