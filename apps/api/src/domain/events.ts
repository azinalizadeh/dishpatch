import { type CreateEventInput, type Dietary, type Snapshot, TokenParam } from '@dishpatch/shared';
import { and, asc, eq, gt } from 'drizzle-orm';
import { alias } from 'drizzle-orm/pg-core';
import type { Clock } from '../clock.ts';
import type { Db } from '../db/client.ts';
import { events, participants, sessions, slots } from '../db/schema.ts';
import type { Actor } from '../middleware/session.ts';
import { notFound } from './errors.ts';
import { generateToken, hashToken } from './tokens.ts';

const RETENTION_MS = 14 * 24 * 60 * 60 * 1000;

export interface CreatedEvent {
  eventId: string;
  hostParticipantId: string;
  /** Raw tokens: returned once, never stored or logged. */
  hostToken: string;
  inviteToken: string;
  sessionToken: string;
  expiresAt: Date;
}

/** Creates the event, its host, its open slots and the host's first session in one transaction. */
export async function createEvent(
  db: Db,
  clock: Clock,
  input: CreateEventInput,
): Promise<CreatedEvent> {
  const hostToken = generateToken();
  const inviteToken = generateToken();
  const sessionToken = generateToken();
  const startsAt = new Date(input.startsAt);
  const expiresAt = new Date(startsAt.getTime() + RETENTION_MS);
  const now = clock.now();

  return db.orm.transaction(async (tx) => {
    const [event] = await tx
      .insert(events)
      .values({
        title: input.title,
        startsAt,
        location: input.location ?? null,
        hostTokenHash: hashToken(hostToken),
        inviteTokenHash: hashToken(inviteToken),
        createdAt: now,
        expiresAt,
      })
      .returning({ id: events.id });
    if (!event) throw new Error('event insert returned no row');

    const [host] = await tx
      .insert(participants)
      .values({
        eventId: event.id,
        displayName: input.hostName,
        dietaryNeeds: input.hostDietaryNeeds,
        role: 'host',
        createdAt: now,
      })
      .returning({ id: participants.id });
    if (!host) throw new Error('participant insert returned no row');

    const slotRows = input.slots.flatMap(({ category, count }) =>
      Array.from({ length: count }, (_, position) => ({ eventId: event.id, category, position })),
    );
    await tx.insert(slots).values(slotRows);

    await tx.insert(sessions).values({
      participantId: host.id,
      tokenHash: hashToken(sessionToken),
      createdAt: now,
      expiresAt,
    });

    return {
      eventId: event.id,
      hostParticipantId: host.id,
      hostToken,
      inviteToken,
      sessionToken,
      expiresAt,
    };
  });
}

export interface HostSession {
  eventId: string;
  /** Raw session token for the cookie; only its hash is stored. */
  sessionToken: string;
  expiresAt: Date;
}

/**
 * Exchanges a host link for a new host session (one per device). Unknown, malformed and expired
 * tokens all throw the same NOT_FOUND, so the response never says whether a board exists.
 */
export async function openHostSession(
  db: Db,
  clock: Clock,
  hostToken: string,
): Promise<HostSession> {
  if (!TokenParam.safeParse(hostToken).success) throw notFound();
  const now = clock.now();

  const [host] = await db.orm
    .select({ eventId: events.id, participantId: participants.id, expiresAt: events.expiresAt })
    .from(events)
    .innerJoin(
      participants,
      and(eq(participants.eventId, events.id), eq(participants.role, 'host')),
    )
    .where(and(eq(events.hostTokenHash, hashToken(hostToken)), gt(events.expiresAt, now)))
    .limit(1);
  if (!host) throw notFound();

  const sessionToken = generateToken();
  await db.orm.insert(sessions).values({
    participantId: host.participantId,
    tokenHash: hashToken(sessionToken),
    createdAt: now,
    expiresAt: host.expiresAt,
  });
  return { eventId: host.eventId, sessionToken, expiresAt: host.expiresAt };
}

const claimant = alias(participants, 'claimant');

/** The whole board for one of its members, read in one repeatable-read transaction so `seq` matches the rows. */
export async function getSnapshot(db: Db, actor: Actor): Promise<Snapshot> {
  return db.orm.transaction(
    async (tx) => {
      const [event] = await tx
        .select({
          id: events.id,
          title: events.title,
          startsAt: events.startsAt,
          location: events.location,
          locked: events.locked,
          seq: events.seq,
        })
        .from(events)
        .where(eq(events.id, actor.eventId));
      if (!event) throw notFound();

      const slotRows = await tx
        .select({
          id: slots.id,
          category: slots.category,
          position: slots.position,
          claimedById: slots.claimedBy,
          claimedByName: claimant.displayName,
          dishName: slots.dishName,
          dishTags: slots.dishTags,
        })
        .from(slots)
        .leftJoin(claimant, eq(claimant.id, slots.claimedBy))
        .where(eq(slots.eventId, event.id))
        .orderBy(asc(slots.category), asc(slots.position));

      const people = await tx
        .select({
          id: participants.id,
          displayName: participants.displayName,
          dietaryNeeds: participants.dietaryNeeds,
          role: participants.role,
        })
        .from(participants)
        .where(eq(participants.eventId, event.id))
        .orderBy(asc(participants.role), asc(participants.createdAt), asc(participants.id));

      const { seq, startsAt, ...rest } = event;
      return {
        event: { ...rest, startsAt: startsAt.toISOString() },
        slots: slotRows.map(({ claimedById, claimedByName, dishTags, ...slot }) => ({
          ...slot,
          claimedBy:
            claimedById && claimedByName ? { id: claimedById, displayName: claimedByName } : null,
          dishTags: dishTags as Dietary[],
        })),
        participants: people.map((p) => ({ ...p, dietaryNeeds: p.dietaryNeeds as Dietary[] })),
        me: { participantId: actor.participantId, role: actor.role },
        seq,
      };
    },
    { isolationLevel: 'repeatable read', accessMode: 'read only' },
  );
}
