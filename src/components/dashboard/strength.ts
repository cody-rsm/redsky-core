export function strengthTone(strength: string | null | undefined): string {
  if (strength === 'Strong') return 'chip-ok';
  if (strength === 'Cooling') return 'chip-wn';
  if (strength === 'New') return 'chip-ai';
  return '';
}
