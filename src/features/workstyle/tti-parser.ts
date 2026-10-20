import { DISC_FACTORS, DRIVING_FORCE_SCALES, type DiscKey, type DrivingForceKey } from './catalog';
import { emptyProfileDraft, type WorkstyleProfileDraft } from './profile';

export const TTI_PARSER_VERSION = 'tti-heuristic-0.1';

export type ExtractionStatus =
  | 'extracted' // every DISC and Driving Forces value was found
  | 'partial' // some values were found; the employee fills the rest
  | 'unrecognized' // text was readable but it does not look like a TTI Talent Insights report
  | 'unreadable'; // no usable text layer (scanned/image PDF) — OCR is not configured

export type ParseResult = {
  status: ExtractionStatus;
  parserVersion: string;
  draft: WorkstyleProfileDraft;
  // Which values came from the document, so the review screen can label them ("Found in your report").
  found: { disc: Partial<Record<DiscKey, { natural: boolean; adapted: boolean }>>; drivingForces: Partial<Record<DrivingForceKey, boolean>> };
  foundCount: number;
  expectedCount: number;
};

const MIN_TEXT_CHARS_PER_PAGE = 40;
const TTI_MARKERS = [/talent\s+insights/i, /driving\s+forces/i, /style\s+insights/i, /\bTTI\b/];

// Heuristic: TTI reports label the two DISC graphs "Adapted Style" and "Natural Style" and print each factor
// with its score. Only explicitly labelled numbers are accepted; nothing is inferred from layout or position.
// Not validated against production reports — every value goes through employee review before use.
export function parseTtiReportText(text: string, pageCount: number): ParseResult {
  const expectedCount = DISC_FACTORS.length * 2 + DRIVING_FORCE_SCALES.length;
  const base: ParseResult = { status: 'unreadable', parserVersion: TTI_PARSER_VERSION, draft: emptyProfileDraft(), found: { disc: {}, drivingForces: {} }, foundCount: 0, expectedCount };
  const normalized = text.replace(/ /g, ' ').replace(/[ \t]+/g, ' ');
  const meaningful = normalized.replace(/\s+/g, '');
  if (meaningful.length < Math.max(1, pageCount) * MIN_TEXT_CHARS_PER_PAGE) return base;
  if (!TTI_MARKERS.some((marker) => marker.test(normalized))) return { ...base, status: 'unrecognized' };

  const result: ParseResult = { ...base, status: 'partial' };
  for (const style of ['natural', 'adapted'] as const) {
    const values = findDiscSection(normalized, style);
    for (const factor of DISC_FACTORS) {
      const value = values[factor.key];
      if (value === undefined) continue;
      result.draft.disc[factor.key][style] = value;
      result.found.disc[factor.key] = { natural: false, adapted: false, ...result.found.disc[factor.key], [style]: true };
      result.foundCount += 1;
    }
  }
  for (const scale of DRIVING_FORCE_SCALES) {
    const left = findLabelledScore(normalized, scale.left);
    const right = findLabelledScore(normalized, scale.right);
    if (left === undefined || right === undefined || left + right === 0) continue;
    result.draft.drivingForces[scale.key] = Math.round((right / (left + right)) * 100);
    result.found.drivingForces[scale.key] = true;
    result.foundCount += 1;
  }
  if (result.foundCount === expectedCount) result.status = 'extracted';
  return result;
}

const SECTION_SPAN = 600;

function findDiscSection(text: string, style: 'natural' | 'adapted'): Partial<Record<DiscKey, number>> {
  const heading = style === 'natural' ? /natural\s+style/gi : /adapted\s+style/gi;
  const out: Partial<Record<DiscKey, number>> = {};
  for (const match of text.matchAll(heading)) {
    const section = text.slice(match.index ?? 0, (match.index ?? 0) + SECTION_SPAN);
    const compact = section.match(/\bD\s*[:=]?\s*(\d{1,3})\b[^\d]{1,30}?\bI\s*[:=]?\s*(\d{1,3})\b[^\d]{1,30}?\bS\s*[:=]?\s*(\d{1,3})\b[^\d]{1,30}?\bC\s*[:=]?\s*(\d{1,3})\b/);
    if (compact) {
      const values = compact.slice(1, 5).map(Number);
      if (values.every(isScore)) {
        DISC_FACTORS.forEach((factor, index) => {
          out[factor.key] = values[index];
        });
        return out;
      }
    }
    for (const factor of DISC_FACTORS) {
      const value = findLabelledScore(section, factor.name);
      if (value !== undefined && out[factor.key] === undefined) out[factor.key] = value;
    }
    if (Object.keys(out).length === DISC_FACTORS.length) return out;
  }
  return out;
}

function findLabelledScore(text: string, label: string): number | undefined {
  const pattern = new RegExp(`\\b${label}\\b\\s*[:=-]?\\s*(\\d{1,3})(?:\\s*%)?\\b`, 'i');
  const match = text.match(pattern);
  if (!match?.[1]) return undefined;
  const value = Number(match[1]);
  return isScore(value) ? value : undefined;
}

function isScore(value: number | undefined): value is number {
  return value !== undefined && Number.isInteger(value) && value >= 0 && value <= 100;
}
