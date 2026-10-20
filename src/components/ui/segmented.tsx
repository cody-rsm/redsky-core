'use client';

import { cn } from '@/lib/utils/cn';

export type SegmentedOption<TValue extends string> = { value: TValue; label: string; title?: string };

type SegmentedProps<TValue extends string> = {
  options: ReadonlyArray<SegmentedOption<TValue>>;
  value: TValue | null;
  onChange: (value: TValue) => void;
  label: string;
  small?: boolean;
  className?: string;
  style?: React.CSSProperties;
  role?: 'group' | 'tablist';
};

export function Segmented<TValue extends string>({ options, value, onChange, label, small, className, style, role = 'group' }: SegmentedProps<TValue>) {
  return (
    <div className={cn('seg', small && 'seg-sm', className)} role={role} aria-label={label} style={style}>
      {options.map((option) => (
        <button
          key={option.value}
          type="button"
          role={role === 'tablist' ? 'tab' : undefined}
          aria-selected={role === 'tablist' ? option.value === value : undefined}
          aria-pressed={option.value === value}
          title={option.title}
          onClick={() => onChange(option.value)}
        >
          {option.label}
        </button>
      ))}
    </div>
  );
}
