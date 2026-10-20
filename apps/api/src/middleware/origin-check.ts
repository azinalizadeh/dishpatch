import type { RequestHandler } from 'express';
import { badOrigin } from '../domain/errors.ts';

const SAFE_METHODS = new Set(['GET', 'HEAD', 'OPTIONS']);

/** Mutations must carry `Origin: APP_ORIGIN` (07-security.md › CORS / CSRF, T2). */
export function originCheck(appOrigin: string): RequestHandler {
  const expected = new URL(appOrigin).origin;
  return (req, _res, next) => {
    if (SAFE_METHODS.has(req.method) || req.get('origin') === expected) {
      next();
      return;
    }
    next(badOrigin());
  };
}
