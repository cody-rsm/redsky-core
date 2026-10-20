import { forwardRef, type ButtonHTMLAttributes, type ReactNode } from 'react';
import { cn } from '@/lib/utils/cn';
import { Icon, type IconName } from './icon';

export type ButtonVariant = 'default' | 'primary' | 'ghost' | 'ai';
export type ButtonSize = 'md' | 'sm' | 'lg';

const VARIANT_CLASS: Record<ButtonVariant, string> = { default: '', primary: 'btn-p', ghost: 'btn-g', ai: 'btn-ai' };
const SIZE_CLASS: Record<ButtonSize, string> = { md: '', sm: 'btn-sm', lg: 'btn-lg' };

export type ButtonProps = ButtonHTMLAttributes<HTMLButtonElement> & {
  variant?: ButtonVariant;
  size?: ButtonSize;
  icon?: IconName;
  iconAfter?: IconName;
  // Icon-only buttons must carry an aria-label (SPEC §10.4); the type requires one.
  iconOnly?: boolean;
  children?: ReactNode;
};

export const Button = forwardRef<HTMLButtonElement, ButtonProps>(function Button(
  { variant = 'default', size = 'md', icon, iconAfter, iconOnly = false, className, children, type = 'button', ...rest },
  ref,
) {
  const iconSize = size === 'sm' ? 's' : size === 'lg' ? 'md' : iconOnly ? 'md' : 's';
  return (
    <button
      ref={ref}
      type={type}
      className={cn('btn', VARIANT_CLASS[variant], SIZE_CLASS[size], iconOnly && 'btn-i', className)}
      {...rest}
    >
      {icon ? <Icon name={icon} size={iconSize} /> : null}
      {children}
      {iconAfter ? <Icon name={iconAfter} size={size === 'lg' ? 'md' : 'xs'} /> : null}
    </button>
  );
});
