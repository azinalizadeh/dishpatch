import { JoinInput, type JoinResponse } from '@dishpatch/shared';
import { Router } from 'express';
import type { Clock } from '../clock.ts';
import type { Db } from '../db/client.ts';
import { joinEvent, previewInvite } from '../domain/participants.ts';
import type { Env } from '../env.ts';
import type { RateLimits } from '../middleware/rate-limits.ts';
import { setSessionCookie } from '../middleware/session.ts';
import { validateBody } from '../middleware/validate.ts';
import type { EventBus } from '../realtime/event-bus.ts';

interface Deps {
  db: Db;
  clock: Clock;
  env: Env;
  bus: EventBus;
  limits: RateLimits;
}

const tokenOf = (param: unknown) => (typeof param === 'string' ? param : '');

export function invitesRouter({ db, clock, env, bus, limits }: Deps): Router {
  const router = Router();

  // #3 Preview: only what the invite card shows, never who has joined.
  router.get('/invites/:inviteToken', limits.invitePreview, async (req, res) => {
    res.json(await previewInvite(db, clock, tokenOf(req.params.inviteToken)));
  });

  // #4 Join → a guest session scoped to this board.
  router.post(
    '/invites/:inviteToken/join',
    limits.join,
    validateBody(JoinInput),
    async (req, res) => {
      const joined = await joinEvent(
        db,
        clock,
        bus,
        tokenOf(req.params.inviteToken),
        res.locals.body as JoinInput,
      );
      setSessionCookie(res, env, clock, {
        eventId: joined.eventId,
        token: joined.sessionToken,
        expiresAt: joined.expiresAt,
      });
      const body: JoinResponse = { eventId: joined.eventId, participantId: joined.participantId };
      res.status(201).json(body);
    },
  );

  return router;
}
