'use client';

import { zodResolver } from '@hookform/resolvers/zod';
import { useRef } from 'react';
import { useForm, type FieldPath } from 'react-hook-form';
import { Icon } from '@/components/ui/icon';
import { DISC_FACTORS, DRIVING_FORCE_SCALES, WORK_PREFERENCE_FIELDS } from '@/features/workstyle/catalog';
import { emptyProfileDraft, workstyleProfileDraftSchema, workstyleProfileSchema, type WorkstyleProfileDraft } from '@/features/workstyle/profile';
import type { WorkstyleDetail } from '@/lib/api/contracts';
import { useWorkstyleActions } from '@/lib/client/workstyle';

type ReviewFormProps = { detail: WorkstyleDetail; onCancel?: () => void; compact?: boolean };

const STATUS_NOTE: Record<NonNullable<WorkstyleDetail['extraction']['status']>, { warn: boolean; text: (found: number, expected: number) => string }> = {
  extracted: { warn: false, text: (found, expected) => `RedSky found all ${found} of ${expected} scores. Check each one against your report — nothing is used until you confirm.` },
  partial: { warn: true, text: (found, expected) => `RedSky found ${found} of ${expected} scores. Fill in the rest from your report, and check the ones that were found.` },
  unrecognized: { warn: true, text: () => 'This file doesn’t look like a TTI Talent Insights report RedSky can read automatically. You can enter the scores from your report below.' },
  unreadable: { warn: true, text: () => 'RedSky couldn’t read text from this PDF — it may be a scanned image. You can enter the scores from your report below.' },
  manual: { warn: false, text: () => 'Enter the scores from your TTI Talent Insights report. Only you can see them.' },
  sample: { warn: false, text: () => 'Illustrative sample values.' },
};

const toScore = (value: unknown) => (value === '' || value === null || value === undefined ? null : Number(value));

export function ReviewForm({ detail, onCancel, compact }: ReviewFormProps) {
  const { saveDraft, review } = useWorkstyleActions();
  const initial = detail.draft ?? emptyProfileDraft();
  const lastSaved = useRef(JSON.stringify(initial));
  const { register, handleSubmit, getValues, setError, setFocus, formState } = useForm<WorkstyleProfileDraft>({
    resolver: zodResolver(workstyleProfileDraftSchema),
    defaultValues: initial,
    mode: 'onBlur',
  });
  const status = detail.extraction.status ?? 'manual';
  const note = STATUS_NOTE[status];
  const found = detail.found;

  const persistDraft = () => {
    const parsed = workstyleProfileDraftSchema.safeParse(getValues());
    if (!parsed.success) return;
    const serialized = JSON.stringify(parsed.data);
    if (serialized === lastSaved.current) return;
    lastSaved.current = serialized;
    saveDraft.mutate(parsed.data);
  };

  const onSubmit = (draft: WorkstyleProfileDraft) => {
    const complete = workstyleProfileSchema.safeParse(draft);
    if (!complete.success) {
      let first: FieldPath<WorkstyleProfileDraft> | null = null;
      for (const issue of complete.error.issues) {
        const path = issue.path.join('.') as FieldPath<WorkstyleProfileDraft>;
        setError(path, { message: 'Required' });
        first ??= path;
      }
      if (first) setFocus(first);
      return;
    }
    review.mutate(complete.data);
  };

  const discError = (path: FieldPath<WorkstyleProfileDraft>) => {
    const [, factor, style] = path.split('.') as ['disc', 'D' | 'I' | 'S' | 'C', 'natural' | 'adapted'];
    return formState.errors.disc?.[factor]?.[style];
  };

  const sourceTag = (wasFound: boolean | undefined) => {
    if (!found) return null;
    return wasFound ? (
      <span className="faint" style={{ fontSize: 10.5 }}>
        From your report
      </span>
    ) : (
      <span className="ws-miss">Not found</span>
    );
  };

  return (
    <form onSubmit={handleSubmit(onSubmit)} onBlur={persistDraft} noValidate style={{ display: 'flex', flexDirection: 'column', gap: 18, marginTop: compact ? 8 : 0 }}>
      <div className={note.warn ? 'note note-wn' : 'note'} role="status">
        <Icon name={note.warn ? 'alert' : 'shield'} size="s" style={{ marginTop: 1, color: note.warn ? 'var(--wn)' : 'var(--ok)' }} />
        <span>{note.text(detail.extraction.foundCount, detail.extraction.expectedCount)}</span>
      </div>

      <fieldset style={{ border: 0, padding: 0, margin: 0, display: 'flex', flexDirection: 'column', gap: 8 }}>
        <legend className="lbl" style={{ marginBottom: 6 }}>
          DISC · natural and adapted scores (0–100)
        </legend>
        <div style={{ display: 'grid', gridTemplateColumns: 'minmax(0,1fr) 64px 64px', gap: '6px 10px', alignItems: 'center', fontSize: 11.5 }} className="faint">
          <span />
          <span style={{ textAlign: 'right' }}>Natural</span>
          <span style={{ textAlign: 'right' }}>Adapted</span>
        </div>
        {DISC_FACTORS.map((factor) => (
          <div key={factor.key} style={{ display: 'grid', gridTemplateColumns: 'minmax(0,1fr) 64px 64px', gap: '6px 10px', alignItems: 'center' }}>
            <span style={{ display: 'flex', alignItems: 'baseline', gap: 8, minWidth: 0 }}>
              <span className="serif" style={{ fontSize: 16, color: 'var(--act)', width: 14 }}>
                {factor.key}
              </span>
              <span style={{ fontSize: 13, fontWeight: 500 }}>{factor.name}</span>
              {found ? sourceTag(found.disc[factor.key]?.natural && found.disc[factor.key]?.adapted) : null}
            </span>
            {(['natural', 'adapted'] as const).map((style) => {
              const path = `disc.${factor.key}.${style}` as const;
              return (
                <input
                  key={style}
                  type="number"
                  inputMode="numeric"
                  min={0}
                  max={100}
                  className="input ws-num"
                  aria-label={`${factor.name} ${style} score`}
                  aria-invalid={Boolean(discError(path))}
                  {...register(path, { setValueAs: toScore })}
                />
              );
            })}
          </div>
        ))}
        {formState.errors.disc ? <span className="field-err">Enter each DISC score as a whole number from 0 to 100.</span> : null}
      </fieldset>

      <fieldset style={{ border: 0, padding: 0, margin: 0, display: 'flex', flexDirection: 'column', gap: 8 }}>
        <legend className="lbl" style={{ marginBottom: 2 }}>
          Driving Forces · position between each pair (0–100)
        </legend>
        <p className="faint" style={{ fontSize: 12, lineHeight: 1.45, marginBottom: 4 }}>
          0 means fully the left force, 100 fully the right. If your report scores both, use right ÷ (left + right) × 100.
        </p>
        {DRIVING_FORCE_SCALES.map((scale) => {
          const error = formState.errors.drivingForces?.[scale.key];
          return (
            <div key={scale.key} style={{ display: 'grid', gridTemplateColumns: 'minmax(0,1fr) 64px minmax(0,1fr)', gap: 10, alignItems: 'center' }}>
              <span style={{ fontSize: 12.5, display: 'flex', gap: 6, alignItems: 'baseline', minWidth: 0 }}>
                <span style={{ fontWeight: 500 }}>{scale.left}</span>
                {found ? sourceTag(found.drivingForces[scale.key]) : null}
              </span>
              <input
                type="number"
                inputMode="numeric"
                min={0}
                max={100}
                className="input ws-num"
                aria-label={`${scale.motivator}: position from ${scale.left} (0) to ${scale.right} (100)`}
                aria-invalid={Boolean(error)}
                {...register(`drivingForces.${scale.key}`, { setValueAs: toScore })}
              />
              <span style={{ fontSize: 12.5, fontWeight: 500, textAlign: 'right' }}>{scale.right}</span>
            </div>
          );
        })}
        {formState.errors.drivingForces ? <span className="field-err">Enter each position as a whole number from 0 to 100.</span> : null}
      </fieldset>

      <fieldset style={{ border: 0, padding: 0, margin: 0, display: 'flex', flexDirection: 'column', gap: 10 }}>
        <legend className="lbl" style={{ marginBottom: 2 }}>
          How you tend to work · optional
        </legend>
        {WORK_PREFERENCE_FIELDS.map((field) => (
          <div key={field.key} className="field">
            <label htmlFor={`ws-pref-${field.key}`}>{field.label}</label>
            <textarea id={`ws-pref-${field.key}`} className="input" rows={2} maxLength={280} placeholder="In your own words, or as your report puts it" {...register(`preferences.${field.key}`)} />
          </div>
        ))}
      </fieldset>

      <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center' }}>
        <button type="submit" className="btn btn-p" disabled={review.isPending}>
          {review.isPending ? <Icon name="refresh" size="s" className="spin" /> : <Icon name="check" size="s" />}
          Use these values
        </button>
        {onCancel ? (
          <button type="button" className="btn btn-g" onClick={onCancel}>
            Start over
          </button>
        ) : null}
        <span className="faint" style={{ fontSize: 11.5 }}>
          {saveDraft.isPending ? 'Saving…' : 'Your edits are saved privately as you go.'}
        </span>
      </div>
    </form>
  );
}

