import {
  CreateEventInput,
  type CreateEventResponse,
  DeleteEventInput,
  type RotateInviteResponse,
  UpdateEventInput,
} from '@dishpatch/shared';
import { Router } from 'express';
import type { Clock } from '../clock.ts';
import type { Db } from '../db/client.ts';
import { createEvent, getSnapshot } from '../domain/events.ts';
import { deleteEvent, rotateInvite, setLocked } from '../domain/host.ts';
import type { Env } from '../env.ts';
import type { RateLimits } from '../middleware/rate-limits.ts';
import { type Actor, requireActor, setSessionCookie } from '../middleware/session.ts';
import { validateBody } from '../middleware/validate.ts';
import type { EventBus } from '../realtime/event-bus.ts';

interface Deps {
  db: Db;
  clock: Clock;
  env: Env;
  bus: EventBus;
  limits: RateLimits;
}

export function eventsRouter({ db, clock, env, bus, limits }: Deps): Router {
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

  // Every board route (#5–#13): probing without a valid session is capped per IP.
  router.use('/events/:eventId', limits.boardMisses);

  // #5 Snapshot for a member of this board; anyone else gets 404.
  router.get('/events/:eventId', requireActor(db, clock), limits.snapshot, async (_req, res) => {
    res.json(await getSnapshot(db, res.locals.actor as Actor));
  });

  // #9 Lock or reopen (host only: the service checks).
  router.patch(
    '/events/:eventId',
    requireActor(db, clock),
    limits.hostActions,
    validateBody(UpdateEventInput),
    async (_req, res) => {
      const { locked } = res.locals.body as UpdateEventInput;
      res.json(await setLocked(db, clock, bus, res.locals.actor as Actor, locked));
    },
  );

  // #12 New invite link; the old one stops working at once.
  router.post(
    '/events/:eventId/invite/rotate',
    requireActor(db, clock),
    limits.rotateInvite,
    async (_req, res) => {
      const { inviteToken, seq } = await rotateInvite(db, clock, bus, res.locals.actor as Actor);
      const body: RotateInviteResponse = {
        inviteUrl: new URL(`/e/${inviteToken}`, env.APP_ORIGIN).toString(),
        seq,
      };
      res.json(body);
    },
  );

  // #13 Delete the board for everyone, after the host types its exact name.
  router.delete(
    '/events/:eventId',
    requireActor(db, clock),
    limits.deleteEvent,
    validateBody(DeleteEventInput),
    async (_req, res) => {
      const { confirmTitle } = res.locals.body as DeleteEventInput;
      await deleteEvent(db, bus, res.locals.actor as Actor, confirmTitle);
      res.status(204).end();
    },
  );

  return router;
}
