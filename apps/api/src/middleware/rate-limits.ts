import type { Request } from 'express';
import { type Options, rateLimit } from 'express-rate-limit';
import { rateLimited } from '../domain/errors.ts';
import { hashToken } from '../domain/tokens.ts';
import { SESSION_COOKIE } from './session.ts';

const MINUTE = 60_000;
const HOUR = 60 * MINUTE;

/** An in-memory limiter (per IP unless `keyGenerator` says otherwise) whose 429 goes through the central error handler. */
function limiter(
  windowMs: number,
  limit: number,
  message: string,
  keyGenerator?: Options['keyGenerator'],
) {
  return rateLimit({
    windowMs,
    ...(keyGenerator ? { keyGenerator } : {}),
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

const perIp = (windowMs: number, limit: number, message: string) =>
  limiter(windowMs, limit, message);

/** Keyed by the session cookie's hash; mount after `requireActor`, so only real sessions count. */
const perSession = (windowMs: number, limit: number, message: string) =>
  limiter(windowMs, limit, message, (req: Request) => {
    const cookies = req.cookies as Record<string, string | undefined> | undefined;
    return hashToken(cookies?.[SESSION_COOKIE] ?? '').toString('hex');
  });

/**
 * Limits from 04-architecture.md › API contract. Built per app instance, so each `buildApp()`
 * (and each test) starts with empty counters.
 */
export function createRateLimits() {
  return {
    createEvent: perIp(HOUR, 5, "You've made a lot of boards — try again in a bit."),
    hostLink: perIp(MINUTE, 10, 'Too many attempts. Try again in a minute.'),
    invitePreview: perIp(MINUTE, 30, 'Too many tries. Wait a minute and try again.'),
    join: perIp(MINUTE, 10, 'Too many tries. Wait a minute and try again.'),
    snapshot: perSession(MINUTE, 120, 'Too many requests. Wait a minute and try again.'),
  };
}

export type RateLimits = ReturnType<typeof createRateLimits>;
