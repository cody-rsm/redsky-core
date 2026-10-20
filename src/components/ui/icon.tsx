import type { CSSProperties } from 'react';
import { cn } from '@/lib/utils/cn';
import { ICON_PATHS, type IconName } from './icon-paths';

export type { IconName };

type IconSize = 'xs' | 's' | 'md' | 'l';

const SIZE_CLASS: Record<IconSize, string> = { xs: 'ic-xs', s: 'ic-s', md: '', l: 'ic-l' };

export type IconProps = {
  name: IconName;
  size?: IconSize;
  className?: string;
  style?: CSSProperties;
  // Decorative by default; pass a label only when the icon is the sole content conveying meaning.
  label?: string;
  strokeWidth?: number;
};

export function Icon({ name, size = 'md', className, style, label, strokeWidth }: IconProps) {
  return (
    <svg
      className={cn('ic', SIZE_CLASS[size], className)}
      viewBox="0 0 24 24"
      aria-hidden={label ? undefined : true}
      role={label ? 'img' : undefined}
      aria-label={label}
      style={strokeWidth ? { ...style, strokeWidth } : style}
      focusable="false"
    >
      <path d={ICON_PATHS[name]} />
    </svg>
  );
}
