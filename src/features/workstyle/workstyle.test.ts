import { describe, expect, it } from 'vitest';
import { recommend } from '@/features/personalization/recommend';
import { acceptAllPending, wsApply, type WorkstyleBaseline, type WsRecommendationStates } from './apply';
import { discStyleNote, primaryDrivers, type WorkstyleProfile } from './profile';
import { suggestFromProfile } from './rules';
import { parseTtiReportText } from './tti-parser';

// The prototype's illustrative assessment (prototype/data/sample-data.json → WS_PROFILE).
const SAMPLE: WorkstyleProfile = {
  disc: { D: { natural: 72, adapted: 68 }, I: { natural: 64, adapted: 70 }, S: { natural: 38, adapted: 42 }, C: { natural: 45, adapted: 52 } },
  drivingForces: { knowledge: 55, utility: 78, surroundings: 42, others: 70, power: 82, methodologies: 72 },
  preferences: {
    communication: 'Brief and direct — bottom line first, detail on request.',
    decisionMaking: 'Moves quickly once the key facts and trade-offs are clear.',
    motivation: 'Influence, visible results and a good return on time invested.',
    environment: 'Fast-paced and varied, with room to persuade and freedom from routine detail.',
  },
};

describe('derived workstyle insights', () => {
  it('derives the prototype primary drivers from the scales', () => {
    expect(primaryDrivers(SAMPLE)).toEqual(['Commanding', 'Resourceful', 'Receptive', 'Intentional']);
  });

  it('describes DISC as tendencies, matching the prototype note', () => {
    expect(discStyleNote(SAMPLE)).toBe(
      'Natural style leans direct and persuasive; the adapted style shows slightly more structure and people focus at work.',
    );
  });
});

describe('recommendation rules', () => {
  it("reproduce the prototype's six suggestions for the sample assessment", () => {
    const suggestions = suggestFromProfile(SAMPLE);
    expect(Object.fromEntries(Object.values(suggestions).map((s) => [s.id, s.choice]))).toEqual({
      layout: 'action',
      prep: 'onepage-15',
      tasks: 'top3',
      comm: 'batched',
      ai: 'executive',
      density: 'focused',
    });
    expect(suggestions.layout.insight).toBe('High Dominance (D 72): tends to focus on results and action.');
    expect(suggestions.tasks.insight).toBe('Receptive driving force (72): comfortable adapting methods to the situation.');
  });

  it('suggest detail and reasoning for a high-Compliance profile', () => {
    const careful: WorkstyleProfile = {
      ...SAMPLE,
      disc: { D: { natural: 30, adapted: 32 }, I: { natural: 35, adapted: 40 }, S: { natural: 55, adapted: 50 }, C: { natural: 78, adapted: 80 } },
      drivingForces: { ...SAMPLE.drivingForces, methodologies: 25, power: 40 },
    };
    const suggestions = suggestFromProfile(careful);
    expect(suggestions.prep.choice).toBe('detailed-30');
    expect(suggestions.ai.choice).toBe('analytical');
    expect(suggestions.density.choice).toBe('comprehensive');
    expect(suggestions.tasks.choice).toBe('due');
    expect(suggestions.layout.choice).toBe('keep');
  });
});

describe('wsApply (SPEC §7.5)', () => {
  const focusAreas = ['ga', 'bd'] as const;
  const goals = ['relationships', 'meetings', 'industry'] as const;
  const baseline: WorkstyleBaseline = {
    density: 'balanced',
    layout: recommend(focusAreas, goals, 'balanced').layout,
    layoutTouched: false,
    aiStyle: 'concise',
    prepFormat: 'standard',
    taskGroup: 'priority',
    notifMode: 'realtime',
    draftTone: 'standard',
  };
  const pending: WsRecommendationStates = {
    layout: { status: 'pending', choice: 'action' },
    prep: { status: 'pending', choice: 'onepage-15' },
    tasks: { status: 'pending', choice: 'top3' },
    comm: { status: 'pending', choice: 'batched' },
    ai: { status: 'pending', choice: 'executive' },
    density: { status: 'pending', choice: 'focused' },
  };

  it('changes nothing while every recommendation is pending', () => {
    expect(wsApply({ baseline, recommendations: pending, focusAreas, goals })).toEqual(baseline);
  });

  it('applies every accepted recommendation in order', () => {
    const effect = wsApply({ baseline, recommendations: acceptAllPending(pending), focusAreas, goals });
    expect(effect).toMatchObject({ density: 'focused', aiStyle: 'executive', prepFormat: 'onepage-15', taskGroup: 'top3', notifMode: 'batched', draftTone: 'direct', layoutTouched: true });
    expect(effect.layout.map((item) => item.id)).toEqual(['brief', 'attention', 'meetings', 'relationships', 'govaffairs']);
  });

  it('restores the baseline value when a recommendation is turned off', () => {
    const accepted = acceptAllPending(pending);
    const withoutAi = { ...accepted, ai: { ...accepted.ai, status: 'dismissed' as const } };
    expect(wsApply({ baseline, recommendations: withoutAi, focusAreas, goals }).aiStyle).toBe('concise');
  });

  it('maps the warm communication option to batched notifications and warm drafts', () => {
    const warm = { ...pending, comm: { status: 'accepted' as const, choice: 'warm' } };
    expect(wsApply({ baseline, recommendations: warm, focusAreas, goals })).toMatchObject({ notifMode: 'batched', draftTone: 'warm' });
  });
});

describe('TTI report parser', () => {
  it('reports an unreadable (scanned) document instead of inventing values', () => {
    const result = parseTtiReportText('   \n  ', 12);
    expect(result.status).toBe('unreadable');
    expect(result.foundCount).toBe(0);
    expect(result.draft.disc.D.natural).toBeNull();
  });

  it('rejects readable text that is not a TTI Talent Insights report', () => {
    const text = 'Quarterly operating review. '.repeat(40);
    expect(parseTtiReportText(text, 2).status).toBe('unrecognized');
  });

  it('extracts explicitly labelled DISC and Driving Forces values', () => {
    const text = [
      'TTI Talent Insights® Report — Sample Person',
      'Style Insights® Graphs',
      'Adapted Style  D 68  I 70  S 42  C 52',
      'Natural Style  D 72  I 64  S 38  C 45',
      'Driving Forces Graph',
      'Intellectual 55 Instinctive 45 Resourceful 78 Selfless 22 Harmonious 42 Objective 58',
      'Intentional 70 Altruistic 30 Commanding 82 Collaborative 18 Receptive 72 Structured 28',
      'Additional narrative text to make the document long enough to be meaningful for extraction. '.repeat(3),
    ].join('\n');
    const result = parseTtiReportText(text, 1);
    expect(result.status).toBe('extracted');
    expect(result.draft.disc.D).toEqual({ natural: 72, adapted: 68 });
    expect(result.draft.disc.C).toEqual({ natural: 45, adapted: 52 });
    expect(result.draft.drivingForces).toEqual({ knowledge: 55, utility: 78, surroundings: 42, others: 70, power: 82, methodologies: 72 });
  });

  it('marks a report as partial when only some values are labelled', () => {
    const text = `TTI Talent Insights report. Natural Style: Dominance 61, Influence 40. ${'Narrative. '.repeat(30)}`;
    const result = parseTtiReportText(text, 1);
    expect(result.status).toBe('partial');
    expect(result.draft.disc.D.natural).toBe(61);
    expect(result.draft.disc.S.natural).toBeNull();
  });
});
