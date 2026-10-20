import { z } from 'zod';
import {
  AI_STYLE_IDS,
  DENSITY_IDS,
  FOCUS_AREA_IDS,
  GOAL_IDS,
  LANDING_IDS,
  WIDGET_IDS,
  WIDGET_SIZES,
  type LayoutItem,
} from '@/features/personalization/catalog';

export const PREP_FORMATS = ['standard', 'onepage-15', 'onepage-30', 'detailed-30'] as const;
export const TASK_GROUPS = ['priority', 'top3', 'due', 'relationship'] as const;
export const DRAFT_TONES = ['standard', 'direct', 'warm'] as const;
export const NOTIF_MODES = ['realtime', 'batched'] as const;
export const DIGEST_TIMES = ['6:30 AM', '7:00 AM', '7:30 AM', 'Off'] as const;
export const THEMES = ['light', 'dark'] as const;
export const SIDEBAR_MODES = ['full', 'collapsed'] as const;
export const DEMO_PERSONA_IDS = ['ga', 'vc', 'exec'] as const;

export type PrepFormat = (typeof PREP_FORMATS)[number];
export type TaskGroup = (typeof TASK_GROUPS)[number];
export type DraftTone = (typeof DRAFT_TONES)[number];
export type NotifMode = (typeof NOTIF_MODES)[number];
export type Theme = (typeof THEMES)[number];
export type SidebarMode = (typeof SIDEBAR_MODES)[number];
export type DemoPersonaId = (typeof DEMO_PERSONA_IDS)[number];

export const focusAreaSchema = z.enum(FOCUS_AREA_IDS);
export const goalSchema = z.enum(GOAL_IDS);

export const layoutItemSchema = z.object({ id: z.enum(WIDGET_IDS), size: z.literal(WIDGET_SIZES) });

export const layoutSchema = z
  .array(layoutItemSchema)
  .max(WIDGET_IDS.length)
  .refine((items) => new Set(items.map((item) => item.id)).size === items.length, 'Each widget can appear once');

export const briefIncludesSchema = z.object({
  meetings: z.boolean(),
  tasks: z.boolean(),
  opps: z.boolean(),
  followups: z.boolean(),
});

export const notificationSettingsSchema = z.object({
  prep: z.boolean(),
  due: z.boolean(),
  rel: z.boolean(),
  pipe: z.boolean(),
  gov: z.boolean(),
});

export const preferencesSchema = z.object({
  goals: z.array(goalSchema).max(GOAL_IDS.length),
  landing: z.enum(LANDING_IDS),
  density: z.enum(DENSITY_IDS),
  aiStyle: z.enum(AI_STYLE_IDS),
  aiUseContext: z.boolean(),
  briefIncludes: briefIncludesSchema,
  notifications: notificationSettingsSchema,
  notifMode: z.enum(NOTIF_MODES),
  digestTime: z.enum(DIGEST_TIMES),
  prepFormat: z.enum(PREP_FORMATS),
  taskGroup: z.enum(TASK_GROUPS),
  draftTone: z.enum(DRAFT_TONES),
  theme: z.enum(THEMES),
  sidebar: z.enum(SIDEBAR_MODES),
  demoPersona: z.enum(DEMO_PERSONA_IDS).nullable(),
});

export type WorkspacePreferences = z.infer<typeof preferencesSchema>;

export const dashboardLayoutSchema = z.object({ layout: layoutSchema, layoutTouched: z.boolean() });
export type DashboardLayout = { layout: LayoutItem[]; layoutTouched: boolean };

// Partial updates. Changing focus areas, goals or density re-runs the recommendation server-side unless the
// employee has edited the layout by hand (SPEC §5.3).
export const preferencesPatchSchema = preferencesSchema.partial().extend({
  focusAreas: z.array(focusAreaSchema).max(FOCUS_AREA_IDS.length).optional(),
  layout: layoutSchema.optional(),
  layoutTouched: z.boolean().optional(),
  resetLayout: z.literal(true).optional(),
});
export type PreferencesPatch = z.infer<typeof preferencesPatchSchema>;

export const DEFAULT_PREFERENCES: WorkspacePreferences = {
  goals: [],
  landing: 'brief',
  density: 'balanced',
  aiStyle: 'concise',
  aiUseContext: true,
  briefIncludes: { meetings: true, tasks: true, opps: true, followups: true },
  notifications: { prep: true, due: true, rel: true, pipe: true, gov: true },
  notifMode: 'realtime',
  digestTime: '7:00 AM',
  prepFormat: 'standard',
  taskGroup: 'priority',
  draftTone: 'standard',
  theme: 'light',
  sidebar: 'full',
  demoPersona: null,
};

export const PREP_FORMAT_LABELS: Record<PrepFormat, string> = {
  standard: 'Standard brief',
  'onepage-15': 'One page · 15-min reminder',
  'onepage-30': 'One page · 30-min reminder',
  'detailed-30': 'Detailed · 30-min reminder',
};
export const TASK_GROUP_LABELS: Record<TaskGroup, string> = {
  priority: 'By priority',
  top3: 'By priority · daily Top 3',
  due: 'By due date',
  relationship: 'By relationship',
};
export const NOTIF_MODE_LABELS: Record<NotifMode, string> = { realtime: 'Real-time', batched: 'Batched · 9 AM & 3 PM' };
export const DRAFT_TONE_LABELS: Record<DraftTone, string> = { standard: 'Standard', direct: 'Direct · ask first', warm: 'Warm · context first' };
