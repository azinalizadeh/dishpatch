import { type InvitePreview, type JoinInput, LIMITS, TokenParam } from '@dishpatch/shared';
import { and, count, eq, gt, sql } from 'drizzle-orm';
import type { Clock } from '../clock.ts';
import type { Db } from '../db/client.ts';
import { events, participants, sessions } from '../db/schema.ts';
import type { EventBus } from '../realtime/event-bus.ts';
import { recordAndPublish } from '../realtime/event-log.ts';
import { eventFull, inviteInvalid, nameTaken } from './errors.ts';
import { generateToken, hashToken } from './tokens.ts';

/** The live event behind an invite token; malformed, unknown, rotated and expired all match nothing. */
function liveInvite(token: string, now: Date) {
  return and(eq(events.inviteTokenHash, hashToken(token)), gt(events.expiresAt, now));
}

/** What the join screen shows before joining. No participant names or needs (07-security.md › I1/I4). */
export async function previewInvite(db: Db, clock: Clock, token: string): Promise<InvitePreview> {
  if (!TokenParam.safeParse(token).success) throw inviteInvalid();
  const [row] = await db.orm
    .select({
      id: events.id,
      title: events.title,
      startsAt: events.startsAt,
      location: events.location,
      hostName: participants.displayName,
    })
    .from(events)
    .innerJoin(
      participants,
      and(eq(participants.eventId, events.id), eq(participants.role, 'host')),
    )
    .where(liveInvite(token, clock.now()))
    .limit(1);
  if (!row) throw inviteInvalid();
  const [{ participantCount = 0 } = {}] = await db.orm
    .select({ participantCount: count() })
    .from(participants)
    .where(eq(participants.eventId, row.id));
  return {
    title: row.title,
    startsAt: row.startsAt.toISOString(),
    location: row.location,
    hostName: row.hostName,
    participantCount,
  };
}

export interface JoinedEvent {
  eventId: string;
  participantId: string;
  /** Raw session token for the cookie; only its hash is stored. */
  sessionToken: string;
  expiresAt: Date;
}

/**
 * Adds a guest to the board behind the invite and opens their first session. The event row is
 * locked for the transaction, so the participant limit, the name check and `seq + 1` hold even
 * when people join at the same moment; `participant.joined` is published only after commit.
 */
export async function joinEvent(
  db: Db,
  clock: Clock,
  bus: EventBus,
  token: string,
  input: JoinInput,
): Promise<JoinedEvent> {
  if (!TokenParam.safeParse(token).success) throw inviteInvalid();
  const now = clock.now();
  const sessionToken = generateToken();

  const joined = await recordAndPublish(db, bus, clock, async (tx, record) => {
    const [event] = await tx
      .select({ id: events.id, expiresAt: events.expiresAt })
      .from(events)
      .where(liveInvite(token, now))
      .for('update');
    if (!event) throw inviteInvalid();

    const [taken] = await tx
      .select({ displayName: participants.displayName })
      .from(participants)
      .where(
        and(
          eq(participants.eventId, event.id),
          sql`lower(${participants.displayName}) = lower(${input.displayName})`,
        ),
      );
    if (taken) throw nameTaken(taken.displayName);

    const [{ total = 0 } = {}] = await tx
      .select({ total: count() })
      .from(participants)
      .where(eq(participants.eventId, event.id));
    if (total >= LIMITS.participantsMax) throw eventFull();

    const [guest] = await tx
      .insert(participants)
      .values({
        eventId: event.id,
        displayName: input.displayName,
        dietaryNeeds: input.dietaryNeeds,
        role: 'guest',
        createdAt: now,
      })
      .returning({ id: participants.id });
    if (!guest) throw new Error('participant insert returned no row');

    await tx.insert(sessions).values({
      participantId: guest.id,
      tokenHash: hashToken(sessionToken),
      createdAt: now,
      expiresAt: event.expiresAt,
    });

    await record(event.id, {
      type: 'participant.joined',
      participant: {
        id: guest.id,
        displayName: input.displayName,
        dietaryNeeds: input.dietaryNeeds,
        role: 'guest',
      },
    });
    return { eventId: event.id, participantId: guest.id, expiresAt: event.expiresAt };
  });

  return {
    eventId: joined.eventId,
    participantId: joined.participantId,
    sessionToken,
    expiresAt: joined.expiresAt,
  };
}
