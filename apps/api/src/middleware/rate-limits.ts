import type { Request, RequestHandler } from 'express';
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
  extra: Partial<Pick<Options, 'keyGenerator' | 'skip'>> = {},
) {
  return rateLimit({
    windowMs,
    ...extra,
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

/**
 * Counts only 404s per IP, i.e. board lookups without a valid session: caps board-id and session
 * probing. Members' own 200s, 429s and 5xx don't count, so guests sharing one IP aren't locked out.
 * Unlike express-rate-limit's `skipSuccessfulRequests` (which counts every request on arrival and
 * refunds it afterwards), a request is counted only once it has answered 404, so a busy board with
 * many concurrent members behind one NAT never trips it. The check still runs before any session
 * lookup, so a prober over the limit costs no database work.
 */
function notFoundsPerIp(windowMs: number, limit: number, message: string): RequestHandler {
  const misses = new Map<string, { count: number; resetAt: number }>();
  let nextSweep = Date.now() + windowMs;
  return (req, res, next) => {
    const now = Date.now();
    if (now >= nextSweep) {
      for (const [ip, entry] of misses) if (entry.resetAt <= now) misses.delete(ip);
      nextSweep = now + windowMs;
    }
    const key = req.ip ?? 'unknown';
    const entry = misses.get(key);
    if (entry && entry.resetAt > now && entry.count >= limit) {
      next(rateLimited(message, Math.max(1, Math.ceil((entry.resetAt - now) / 1000))));
      return;
    }
    res.on('finish', () => {
      if (res.statusCode !== 404) return;
      const at = Date.now();
      const current = misses.get(key);
      if (current && current.resetAt > at) current.count += 1;
      else misses.set(key, { count: 1, resetAt: at + windowMs });
    });
    next();
  };
}

/** Keyed by the session cookie's hash; mount after `requireActor`, so only real sessions count. */
const perSession = (windowMs: number, limit: number, message: string) =>
  limiter(windowMs, limit, message, {
    keyGenerator: (req: Request) => {
      const cookies = req.cookies as Record<string, string | undefined> | undefined;
      return hashToken(cookies?.[SESSION_COOKIE] ?? '').toString('hex');
    },
  });

/**
 * Keyed by the board in the path (rotation is per board, not per device), counting only the
 * host's requests: mount after `requireActor`. A guest's call is refused by the service anyway
 * (403 HOST_ONLY) and must not use up the host's budget.
 */
const perEventForHost = (windowMs: number, limit: number, message: string) =>
  limiter(windowMs, limit, message, {
    keyGenerator: (req: Request) => {
      const eventId = req.params.eventId;
      return `event:${typeof eventId === 'string' ? eventId : ''}`;
    },
    skip: (_req, res) => (res.locals.actor as { role?: string } | undefined)?.role !== 'host',
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
    claims: perSession(MINUTE, 30, "You're claiming very fast. Wait a minute and try again."),
    hostActions: perSession(MINUTE, 30, "You're changing things very fast. Wait a minute."),
    rotateInvite: perEventForHost(HOUR, 5, "You've made a lot of new links — try again in a bit."),
    deleteEvent: perSession(HOUR, 5, 'Too many tries. Wait a bit and try again.'),
    boardMisses: notFoundsPerIp(MINUTE, 30, 'Too many tries. Wait a minute and try again.'),
  };
}

export type RateLimits = ReturnType<typeof createRateLimits>;
