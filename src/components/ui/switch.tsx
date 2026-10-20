'use client';

type SwitchProps = {
  checked: boolean;
  onCheckedChange?: (checked: boolean) => void;
  label: string;
  disabled?: boolean;
  className?: string;
  style?: React.CSSProperties;
};

// SPEC §10.4: switches are real buttons with role="switch" and aria-checked.
export function Switch({ checked, onCheckedChange, label, disabled, className, style }: SwitchProps) {
  return (
    <button
      type="button"
      className={className ? `sw ${className}` : 'sw'}
      role="switch"
      aria-checked={checked}
      aria-label={label}
      disabled={disabled}
      style={style}
      onClick={() => onCheckedChange?.(!checked)}
    />
  );
}
