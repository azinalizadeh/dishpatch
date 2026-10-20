import { CreateEventInput, type CreateEventResponse } from '@dishpatch/shared';
import { Router } from 'express';
import type { Clock } from '../clock.ts';
import type { Db } from '../db/client.ts';
import { createEvent } from '../domain/events.ts';
import type { Env } from '../env.ts';
import type { RateLimits } from '../middleware/rate-limits.ts';
import { setSessionCookie } from '../middleware/session.ts';
import { validateBody } from '../middleware/validate.ts';

interface Deps {
  db: Db;
  clock: Clock;
  env: Env;
  limits: RateLimits;
}

export function eventsRouter({ db, clock, env, limits }: Deps): Router {
  const router = Router();

  // #1 Create a board: the raw tokens leave the server only in this response body and cookie.
  router.post('/events', limits.createEvent, validateBody(CreateEventInput), async (_req, res) => {
    const created = await createEvent(db, clock, res.locals.body as CreateEventInput);
    setSessionCookie(res, env, clock, {
      eventId: created.eventId,
      token: created.sessionToken,
      expiresAt: created.expiresAt,
    });
    const body: CreateEventResponse = {
      eventId: created.eventId,
      inviteUrl: new URL(`/e/${created.inviteToken}`, env.APP_ORIGIN).toString(),
      hostUrl: new URL(`/h/${created.hostToken}`, env.APP_ORIGIN).toString(),
    };
    res.status(201).json(body);
  });

  return router;
}
