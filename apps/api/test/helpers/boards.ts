import type { Dietary } from '@dishpatch/shared';
import { asc, eq } from 'drizzle-orm';
import { friendsgivingPayload } from '../../../../packages/shared/test/fixtures/create-event.ts';
import type { Db } from '../../src/db/client.ts';
import { slots } from '../../src/db/schema.ts';
import { createEvent } from '../../src/domain/events.ts';
import { joinEvent } from '../../src/domain/participants.ts';
import { createInProcessEventBus } from '../../src/realtime/event-bus.ts';
import { fixedClock } from './test-app.ts';

/** "Now" for F2 tests; boards start on 21 Nov and expire 14 days later. */
export const clock = fixedClock('2026-10-20T12:00:00Z');
export const afterExpiry = fixedClock('2026-12-06T00:00:00Z');

export function createBoard(db: Db) {
  return createEvent(db, clock, {
    ...friendsgivingPayload(clock.now()),
    startsAt: '2026-11-21T17:00:00.000Z',
  });
}

/** Adds a guest straight through the service (no join rate limit) and returns their session. */
export async function joinGuest(
  db: Db,
  board: { inviteToken: string },
  displayName: string,
  dietaryNeeds: Dietary[] = [],
) {
  const joined = await joinEvent(db, clock, createInProcessEventBus(), board.inviteToken, {
    displayName,
    dietaryNeeds,
  });
  return { participantId: joined.participantId, cookie: joined.sessionToken };
}

/** The board's slot ids in display order (mains first). */
export async function slotIds(db: Db, eventId: string) {
  const rows = await db.orm
    .select({ id: slots.id, category: slots.category })
    .from(slots)
    .where(eq(slots.eventId, eventId))
    .orderBy(asc(slots.category), asc(slots.position));
  return rows;
}
