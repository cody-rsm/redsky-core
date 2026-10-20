import type { CSSProperties } from 'react';
import { cn } from '@/lib/utils/cn';
import { Icon, type IconName } from './icon';

type TileProps = { icon: IconName; small?: boolean; ai?: boolean; className?: string; style?: CSSProperties; iconSize?: 'xs' | 's' | 'md' | 'l' };

export function Tile({ icon, small, ai, className, style, iconSize }: TileProps) {
  return (
    <span className={cn('tile', small && 'tile-s', ai && 'tile-ai', className)} style={style}>
      <Icon name={icon} size={iconSize ?? (small ? 's' : 'md')} />
    </span>
  );
}
