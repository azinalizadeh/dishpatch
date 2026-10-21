import { TokenParam } from '@dishpatch/shared';
import { and, eq, gt } from 'drizzle-orm';
import type { Response } from 'express';
import { z } from 'zod';
import type { Clock } from '../clock.ts';
import type { Db } from '../db/client.ts';
import { participants, sessions } from '../db/schema.ts';
import { hashToken } from '../domain/tokens.ts';
import type { Env } from '../env.ts';

export const SESSION_COOKIE = 'dp_sess';

/** Who is acting on a board; domain services authorise against this, never raw client ids. */
export interface Actor {
  eventId: string;
  participantId: string;
  role: 'host' | 'guest';
}

const EventId = z.uuid();

/** Session cookie flags from 07-security.md › Authentication & sessions. */
export function setSessionCookie(
  res: Response,
  env: Env,
  clock: Clock,
  session: { eventId: string; token: string; expiresAt: Date },
): void {
  res.cookie(SESSION_COOKIE, session.token, {
    httpOnly: true,
    sameSite: 'strict',
    secure: env.COOKIE_SECURE,
    path: `/api/events/${session.eventId}`,
    maxAge: Math.max(0, session.expiresAt.getTime() - clock.now().getTime()),
  });
}

/** The actor behind a session token for this event, or null (callers answer 404, never 403). */
export async function resolveActor(
  db: Db,
  clock: Clock,
  sessionToken: string | undefined,
  eventId: string,
): Promise<Actor | null> {
  if (!TokenParam.safeParse(sessionToken).success || !EventId.safeParse(eventId).success) {
    return null;
  }
  const [row] = await db.orm
    .select({ participantId: participants.id, role: participants.role })
    .from(sessions)
    .innerJoin(participants, eq(participants.id, sessions.participantId))
    .where(
      and(
        eq(sessions.tokenHash, hashToken(sessionToken as string)),
        eq(participants.eventId, eventId),
        gt(sessions.expiresAt, clock.now()),
      ),
    )
    .limit(1);
  return row ? { eventId, participantId: row.participantId, role: row.role } : null;
}
