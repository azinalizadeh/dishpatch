import type { CreateEventInput } from '@dishpatch/shared';
import type { Clock } from '../clock.ts';
import type { Db } from '../db/client.ts';
import { events, participants, sessions, slots } from '../db/schema.ts';
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
