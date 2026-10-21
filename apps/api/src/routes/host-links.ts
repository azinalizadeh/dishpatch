import type { HostLinkResponse } from '@dishpatch/shared';
import { Router } from 'express';
import type { Clock } from '../clock.ts';
import type { Db } from '../db/client.ts';
import { openHostSession } from '../domain/events.ts';
import type { Env } from '../env.ts';
import type { RateLimits } from '../middleware/rate-limits.ts';
import { setSessionCookie } from '../middleware/session.ts';

interface Deps {
  db: Db;
  clock: Clock;
  env: Env;
  limits: RateLimits;
}

export function hostLinksRouter({ db, clock, env, limits }: Deps): Router {
  const router = Router();

  // #2 Host link on another device → a new host session for that board.
  router.post('/host-links/:hostToken/session', limits.hostLink, async (req, res) => {
    const { hostToken } = req.params;
    const session = await openHostSession(
      db,
      clock,
      typeof hostToken === 'string' ? hostToken : '',
    );
    setSessionCookie(res, env, clock, {
      eventId: session.eventId,
      token: session.sessionToken,
      expiresAt: session.expiresAt,
    });
    const body: HostLinkResponse = { eventId: session.eventId };
    res.json(body);
  });

  return router;
}
