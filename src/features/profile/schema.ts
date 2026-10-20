import { z } from 'zod';
import { DEPARTMENTS, OFFICES } from '@/features/personalization/catalog';

const officeValues = OFFICES.map((office) => office.value) as [string, ...string[]];

// Shared by the onboarding/settings forms (React Hook Form) and the profile API. Email is managed by IT and is
// not editable here.
export const profileFieldsSchema = z.object({
  firstName: z.string().trim().max(80, 'Keep it under 80 characters'),
  lastName: z.string().trim().max(80, 'Keep it under 80 characters'),
  preferredName: z.string().trim().max(80, 'Keep it under 80 characters'),
  title: z.string().trim().max(120, 'Keep it under 120 characters'),
  department: z.union([z.enum(DEPARTMENTS), z.literal('')]),
  phone: z
    .string()
    .trim()
    .max(40, 'Keep it under 40 characters')
    .regex(/^[0-9+().\-\s x]*$/i, 'Use digits, spaces and + ( ) - . only'),
  office: z.enum(officeValues),
  bio: z.string().trim().max(280, 'Keep it to 280 characters'),
  monogramTone: z.number().int().min(0).max(5),
});

export type ProfileFields = z.infer<typeof profileFieldsSchema>;

export const profilePatchSchema = profileFieldsSchema.partial();
export type ProfilePatch = z.infer<typeof profilePatchSchema>;

// Completing the profile step requires a first name (SPEC §4 step 2).
export const profileStepSchema = profileFieldsSchema.extend({
  firstName: z.string().trim().min(1, 'Enter your first name').max(80),
});

export const PROFILE_PHOTO_MAX_BYTES = 2 * 1024 * 1024;
export const PROFILE_PHOTO_TYPES = ['image/png', 'image/jpeg', 'image/webp', 'image/gif'] as const;
