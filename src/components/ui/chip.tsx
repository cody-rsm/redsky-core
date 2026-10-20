import type { CSSProperties, ReactNode } from 'react';
import { cn } from '@/lib/utils/cn';
import { Icon, type IconName } from './icon';

export type ChipTone = 'neutral' | 'outline' | 'ai' | 'accent' | 'ok' | 'warn';

const TONE_CLASS: Record<ChipTone, string> = {
  neutral: '',
  outline: 'chip-o',
  ai: 'chip-ai',
  accent: 'chip-ac',
  ok: 'chip-ok',
  warn: 'chip-wn',
};

type ChipProps = {
  tone?: ChipTone;
  icon?: IconName;
  dot?: boolean;
  small?: boolean;
  className?: string;
  style?: CSSProperties;
  title?: string;
  children: ReactNode;
};

export function Chip({ tone = 'neutral', icon, dot, small, className, style, title, children }: ChipProps) {
  return (
    <span
      className={cn('chip', TONE_CLASS[tone], className)}
      style={small ? { height: 18, fontSize: 10.5, ...style } : style}
      title={title}
    >
      {dot ? <span className="dot" /> : null}
      {icon ? <Icon name={icon} size="xs" /> : null}
      {children}
    </span>
  );
}

export function chipToneClass(tone: ChipTone): string {
  return TONE_CLASS[tone];
}
