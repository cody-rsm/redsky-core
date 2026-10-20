import type { CSSProperties } from 'react';
import { cn } from '@/lib/utils/cn';

export type AvatarTone = 0 | 1 | 2 | 3 | 4 | 5;
type AvatarSize = 'sm' | 'md' | 'lg' | 'xl';

const SIZE_CLASS: Record<AvatarSize, string> = { sm: 'av-sm', md: '', lg: 'av-lg', xl: 'av-xl' };

type AvatarProps = {
  initials: string;
  tone: number;
  size?: AvatarSize;
  photoUrl?: string | null;
  title?: string;
  className?: string;
  style?: CSSProperties;
};

export function Avatar({ initials, tone, size = 'md', photoUrl, title, className, style }: AvatarProps) {
  return (
    <span className={cn('av', SIZE_CLASS[size], `av-${normalizeTone(tone)}`, className)} title={title} style={style}>
      {photoUrl ? (
        // Profile photos are served from the authenticated /api/me/photo route; next/image adds nothing here.
        // eslint-disable-next-line @next/next/no-img-element
        <img src={photoUrl} alt="" />
      ) : (
        initials
      )}
    </span>
  );
}

export function normalizeTone(tone: number): AvatarTone {
  const value = Math.abs(Math.trunc(tone)) % 6;
  return value as AvatarTone;
}

export function initialsFromName(name: string): string {
  return name
    .split(' ')
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part.charAt(0))
    .join('')
    .toUpperCase();
}

type AvatarButtonProps = Omit<AvatarProps, 'title'> & { label: string; onClick: () => void; title?: string };

// Clickable avatar where the avatar itself is the button (prototype: profile shortcuts in the shell).
export function AvatarButton({ initials, tone, size = 'md', photoUrl, label, onClick, title, className, style }: AvatarButtonProps) {
  return (
    <button type="button" className={cn('av', SIZE_CLASS[size], `av-${normalizeTone(tone)}`, className)} style={{ cursor: 'pointer', ...style }} aria-label={label} title={title} onClick={onClick}>
      {photoUrl ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={photoUrl} alt="" />
      ) : (
        initials
      )}
    </button>
  );
}
