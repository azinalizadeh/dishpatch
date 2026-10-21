import type { Dietary, Snapshot } from '@dishpatch/shared';
import { asc, eq } from 'drizzle-orm';
import { alias } from 'drizzle-orm/pg-core';
import type { Db } from '../db/client.ts';
import { events, participants, slots } from '../db/schema.ts';
import type { Actor } from '../middleware/session.ts';
import { notFound } from './errors.ts';

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
