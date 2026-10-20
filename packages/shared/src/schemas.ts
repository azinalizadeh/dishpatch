import { z } from 'zod';
import { DIETARY } from './dietary.ts';

export const DietarySchema = z.enum(DIETARY);

/** The one error body every API error uses (04-architecture.md › API contract). */
export const ApiErrorSchema = z.object({
  error: z.object({
    code: z.string().min(1),
    message: z.string().min(1),
    requestId: z.string().min(1),
  }),
});

export type ApiError = z.infer<typeof ApiErrorSchema>;
