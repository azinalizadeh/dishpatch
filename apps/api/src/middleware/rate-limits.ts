import { rateLimit } from 'express-rate-limit';
import { rateLimited } from '../domain/errors.ts';

const MINUTE = 60_000;
const HOUR = 60 * MINUTE;

/** An in-memory, per-IP limiter whose 429 goes through the central error handler. */
function perIp(windowMs: number, limit: number, message: string) {
  return rateLimit({
    windowMs,
    limit,
    standardHeaders: 'draft-8',
    legacyHeaders: false,
    handler: (req, _res, next) => {
      const info = (req as { rateLimit?: { resetTime?: Date } }).rateLimit;
      const resetTime = info?.resetTime?.getTime() ?? Date.now() + windowMs;
      next(rateLimited(message, Math.max(1, Math.ceil((resetTime - Date.now()) / 1000))));
    },
  });
}

/**
 * Limits from 04-architecture.md › API contract. Built per app instance, so each `buildApp()`
 * (and each test) starts with empty counters.
 */
export function createRateLimits() {
  return {
    createEvent: perIp(HOUR, 5, "You've made a lot of boards — try again in a bit."),
    hostLink: perIp(MINUTE, 10, 'Too many attempts. Try again in a minute.'),
  };
}

export type RateLimits = ReturnType<typeof createRateLimits>;
