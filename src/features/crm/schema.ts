import { z } from 'zod';

// Shared by the forms and the API, so the browser and the server accept exactly the same input.

const optionalText = (max: number) =>
  z
    .string()
    .trim()
    .max(max)
    .optional()
    .transform((value) => value || undefined);

export const contactInputSchema = z.object({
  fullName: z.string().trim().min(1, 'Required').max(200, 'Keep it under 200 characters'),
  email: z
    .string()
    .trim()
    .max(254)
    .optional()
    .transform((value) => value || undefined)
    .pipe(z.string().email('Enter a valid email address').optional()),
  jobTitle: optionalText(200),
  organization: optionalText(200),
  note: optionalText(5000),
});
export type ContactInput = z.infer<typeof contactInputSchema>;

export const addContactSchema = contactInputSchema.extend({
  requestKey: z.string().uuid(),
  // From the review: link to this existing organization, or (with createOrganization) add `organization` as new.
  organizationId: z.string().uuid().nullish(),
  createOrganization: z.boolean().default(false),
});

export const addNoteSchema = z.object({
  requestKey: z.string().uuid(),
  target: z.object({ kind: z.enum(['contact', 'company']), id: z.string().uuid() }),
  title: optionalText(200),
  body: z.string().trim().min(1, 'Write the note').max(10000, 'Keep notes under 10,000 characters'),
});

// "Jordan Alvarez" → first "Jordan", last "Alvarez"; a single word is a first name.
export function splitFullName(fullName: string): { firstName: string; lastName: string } {
  const parts = fullName.trim().split(/\s+/);
  if (parts.length === 1) return { firstName: parts[0] ?? '', lastName: '' };
  return { firstName: parts.slice(0, -1).join(' '), lastName: parts.at(-1) ?? '' };
}
