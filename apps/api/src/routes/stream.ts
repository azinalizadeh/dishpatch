import { Router } from 'express';
import type { Clock } from '../clock.ts';
import type { Db } from '../db/client.ts';
import { hashToken } from '../domain/tokens.ts';
import { type Actor, requireActor, SESSION_COOKIE } from '../middleware/session.ts';
import type { SseHub } from '../realtime/sse-hub.ts';

interface Deps {
  db: Db;
  clock: Clock;
  hub: SseHub;
}

const SEQ = /^\d{1,15}$/;

/**
 * Where the client is: the `Last-Event-ID` header EventSource sends on reconnect, or `?after=`
 * (the snapshot's seq) on the first connect, since EventSource can't set headers itself.
 * Anything malformed counts as "from the very start", which the log answers with `resync`.
 */
function afterSeqOf(header: string | undefined, query: unknown): number | undefined {
  const raw = header ?? (typeof query === 'string' ? query : undefined);
  if (raw === undefined) return undefined;
  return SEQ.test(raw.trim()) ? Number(raw.trim()) : 0;
}

export function streamRouter({ db, clock, hub }: Deps): Router {
  const router = Router();

  // #6 Live board stream, members only; a session of another board gets 404 (07-security.md › I3).
  router.get('/events/:eventId/stream', requireActor(db, clock), async (req, res) => {
    const actor = res.locals.actor as Actor;
    const cookies = req.cookies as Record<string, string | undefined>;
    try {
      await hub.open(
        {
          eventId: actor.eventId,
          sessionKey: hashToken(cookies[SESSION_COOKIE] ?? '').toString('hex'),
          ip: req.ip ?? '',
          afterSeq: afterSeqOf(req.get('Last-Event-ID'), req.query.after),
        },
        res,
      );
    } catch (err) {
      // Before the headers went out it's a normal API error; after, the stream just ends and
      // EventSource reconnects with its Last-Event-ID.
      if (!res.headersSent) throw err;
      req.log.error({ err }, 'stream failed after headers');
      res.end();
    }
  });

  return router;
}
