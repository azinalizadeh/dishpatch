import { ClaimInput } from '@dishpatch/shared';
import { Router } from 'express';
import type { Clock } from '../clock.ts';
import type { Db } from '../db/client.ts';
import { claimSlot, releaseSlot } from '../domain/claims.ts';
import type { RateLimits } from '../middleware/rate-limits.ts';
import { type Actor, requireActor } from '../middleware/session.ts';
import { validateBody } from '../middleware/validate.ts';
import type { EventBus } from '../realtime/event-bus.ts';

interface Deps {
  db: Db;
  clock: Clock;
  bus: EventBus;
  limits: RateLimits;
}

const slotIdOf = (param: unknown) => (typeof param === 'string' ? param : '');

/** API #7–#8. Origin and JSON-only checks run app-wide before this router (07-security.md › T2). */
export function slotsRouter({ db, clock, bus, limits }: Deps): Router {
  const router = Router();
  const path = '/events/:eventId/slots/:slotId/claim';

  router.post(
    path,
    requireActor(db, clock),
    limits.claims,
    validateBody(ClaimInput),
    async (req, res) => {
      const actor = res.locals.actor as Actor;
      const body = res.locals.body as ClaimInput;
      res.json(await claimSlot(db, clock, bus, actor, slotIdOf(req.params.slotId), body));
    },
  );

  router.delete(path, requireActor(db, clock), limits.claims, async (req, res) => {
    const actor = res.locals.actor as Actor;
    res.json(await releaseSlot(db, clock, bus, actor, slotIdOf(req.params.slotId)));
  });

  return router;
}
