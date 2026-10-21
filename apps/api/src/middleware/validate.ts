import type { RequestHandler } from 'express';
import type { z } from 'zod';
import { validationFailed } from '../domain/errors.ts';

/**
 * Parses the body with a shared Zod schema; 400 VALIDATION on failure with one message per field.
 * Handlers read the typed result from `res.locals.body`.
 */
export function validateBody(schema: z.ZodType): RequestHandler {
  return (req, res, next) => {
    const result = schema.safeParse(req.body);
    if (result.success) {
      res.locals.body = result.data;
      next();
      return;
    }
    const fields: Record<string, string> = {};
    for (const issue of result.error.issues) {
      const path = issue.path.length > 0 ? issue.path.join('.') : 'body';
      fields[path] ??= issue.message;
    }
    next(validationFailed(fields));
  };
}
