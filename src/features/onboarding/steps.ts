import type { IconName } from '@/components/ui/icon';

export const ONBOARDING_STEPS = [
  { slug: 'welcome', label: 'Welcome', hint: 'About 5 minutes', footHint: '' },
  { slug: 'profile', label: 'Profile', hint: 'Confirm your details', footHint: 'Prefilled from Microsoft Entra ID' },
  { slug: 'role', label: 'Role', hint: 'Areas you work in', footHint: 'Select at least one area' },
  { slug: 'workstyle', label: 'Workstyle', hint: 'Optional assessment', footHint: 'Optional · private to you · you decide what to keep' },
  { slug: 'connect', label: 'Connect', hint: 'Tools you already use', footHint: 'Optional — skip any integration' },
  { slug: 'preferences', label: 'Preferences', hint: 'What matters most', footHint: 'You can change these any time' },
  { slug: 'ai', label: 'RedSky AI', hint: 'Assistant preferences', footHint: 'Proposed capabilities are marked' },
  { slug: 'home', label: 'Home page', hint: 'Choose your widgets', footHint: 'Drag in the preview to reorder' },
  { slug: 'ready', label: "You're ready", hint: 'Review and enter', footHint: 'Review your setup' },
] as const;

export type OnboardingStepSlug = (typeof ONBOARDING_STEPS)[number]['slug'];
export const ONBOARDING_STEP_COUNT = ONBOARDING_STEPS.length;

export function stepIndexForSlug(slug: string): number {
  return ONBOARDING_STEPS.findIndex((step) => step.slug === slug);
}

// Steps that can be skipped (SPEC §4): Workstyle through Home page.
export function isSkippableStep(index: number): boolean {
  return index >= 3 && index <= 7;
}

// Returns why the employee cannot leave `index` yet, or null.
export function onboardingStepBlocker(index: number, state: { firstName: string; focusAreaCount: number }): string | null {
  if (index === 1 && !state.firstName.trim()) return 'Enter your first name to continue';
  if (index === 2 && state.focusAreaCount === 0) return 'Select at least one area to continue';
  return null;
}

export const WELCOME_PREVIEW: ReadonlyArray<{ icon: IconName; text: string }> = [
  { icon: 'user', text: 'Confirm your profile, your role and — optionally — your workstyle' },
  { icon: 'plug', text: 'Connect the tools you already use — or skip for now' },
  { icon: 'layout', text: 'Shape your home page and RedSky AI' },
];
