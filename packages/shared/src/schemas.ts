import { z } from 'zod';
import { CATEGORIES, LIMITS } from './categories.ts';
import { DIETARY } from './dietary.ts';

export const DietarySchema = z.enum(DIETARY);
export const CategorySchema = z.enum(CATEGORIES);

/** No control characters anywhere in user text (07-security.md › Input validation). */
const NO_CONTROL = /^[^\p{Cc}]*$/u;
const NO_CONTROL_MESSAGE = 'Remove the special characters.';

/** Length in code points, as Postgres `varchar(n)` counts it (an emoji is 1, not 2). */
const codePoints = (value: string) => [...value].length;

function text(max: number, messages: { empty: string; tooLong: string }) {
  return z
    .string()
    .trim()
    .min(1, messages.empty)
    .refine((value) => codePoints(value) <= max, messages.tooLong)
    .regex(NO_CONTROL, NO_CONTROL_MESSAGE);
}

/** The one error body every API error uses (04-architecture.md › API contract), with the optional details some codes carry. */
export const ApiErrorSchema = z.object({
  error: z.object({
    code: z.string().min(1),
    message: z.string().min(1),
    requestId: z.string().min(1),
    fields: z.record(z.string(), z.string()).optional(),
    retryAfterSeconds: z.number().optional(),
  }),
});

export type ApiError = z.infer<typeof ApiErrorSchema>;

export const SlotCountInput = z.object({
  category: CategorySchema,
  count: z
    .number()
    .int()
    .min(0)
    .max(LIMITS.slotsPerCategoryMax, `Up to ${LIMITS.slotsPerCategoryMax} per category.`),
});

export type SlotCountInput = z.infer<typeof SlotCountInput>;

export const CreateEventInput = z.object({
  title: text(LIMITS.titleMax, {
    empty: 'Give your board a name.',
    tooLong: `Keep the name under ${LIMITS.titleMax} characters.`,
  }),
  startsAt: z.iso
    .datetime({ offset: true, error: 'Pick a date and time.' })
    .refine((value) => Date.parse(value) > Date.now(), 'Pick a date in the future.'),
  location: z.preprocess(
    (value) => (typeof value === 'string' && value.trim() === '' ? undefined : value),
    z
      .string()
      .trim()
      .max(LIMITS.locationMax, `Keep the place under ${LIMITS.locationMax} characters.`)
      .regex(NO_CONTROL, NO_CONTROL_MESSAGE)
      .optional(),
  ),
  hostName: text(LIMITS.nameMax, {
    empty: "Add a name so guests know who's hosting.",
    tooLong: `Keep your name under ${LIMITS.nameMax} characters.`,
  }),
  hostDietaryNeeds: z
    .array(DietarySchema)
    .refine((needs) => new Set(needs).size === needs.length, 'Pick each need once.'),
  slots: z.array(SlotCountInput).superRefine((slots, ctx) => {
    const categories = slots.map((s) => s.category);
    if (new Set(categories).size !== categories.length) {
      ctx.addIssue({ code: 'custom', message: 'List each category once.' });
      return;
    }
    const total = slots.reduce((sum, s) => sum + s.count, 0);
    if (total < 1) ctx.addIssue({ code: 'custom', message: 'Add at least one slot.' });
    if (total > LIMITS.slotsTotalMax) {
      ctx.addIssue({
        code: 'custom',
        message: `A board can have up to ${LIMITS.slotsTotalMax} slots.`,
      });
    }
  }),
});

export type CreateEventInput = z.output<typeof CreateEventInput>;

export const CreateEventResponse = z.object({
  eventId: z.uuid(),
  inviteUrl: z.url(),
  hostUrl: z.url(),
});

export type CreateEventResponse = z.infer<typeof CreateEventResponse>;

export const HostLinkResponse = z.object({ eventId: z.uuid() });

export type HostLinkResponse = z.infer<typeof HostLinkResponse>;

export const JoinInput = z.object({
  displayName: text(LIMITS.nameMax, {
    empty: 'Add a name so people know who you are.',
    tooLong: `Keep your name under ${LIMITS.nameMax} characters.`,
  }),
  // Needs are a set: repeats are dropped rather than rejected.
  dietaryNeeds: z.array(DietarySchema).transform((needs) => [...new Set(needs)]),
});

export type JoinInput = z.output<typeof JoinInput>;

/** What anyone holding the invite link may see: no participant names or needs (07-security.md › I1/I4). */
export const InvitePreview = z.object({
  title: z.string(),
  startsAt: z.iso.datetime({ offset: true }),
  location: z.string().nullable(),
  hostName: z.string(),
  participantCount: z.number().int().min(0),
});

export type InvitePreview = z.infer<typeof InvitePreview>;

export const JoinResponse = z.object({ eventId: z.uuid(), participantId: z.uuid() });

export type JoinResponse = z.infer<typeof JoinResponse>;

/** Capability tokens: 32 random bytes as base64url (07-security.md › Authentication). */
export const TokenParam = z.string().regex(/^[A-Za-z0-9_-]{43}$/);
