import type { Dietary } from '@dishpatch/shared';
import { asc, eq } from 'drizzle-orm';
import { friendsgivingPayload } from '../../../../packages/shared/test/fixtures/create-event.ts';
import {
  MOCKUP_CLAIMS,
  MOCKUP_PEOPLE,
  MOCKUP_SLOTS,
} from '../../../../packages/shared/test/fixtures/mockup-board.ts';
import type { Db } from '../../src/db/client.ts';
import { slots } from '../../src/db/schema.ts';
import { claimSlot } from '../../src/domain/claims.ts';
import { createEvent } from '../../src/domain/events.ts';
import { joinEvent } from '../../src/domain/participants.ts';
import type { Actor } from '../../src/middleware/session.ts';
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

/**
 * The board from design/mockup.html (packages/shared/test/fixtures/mockup-board.ts), seeded
 * through the services: Mina hosts, five guests join, six dishes are claimed.
 */
export async function createMockupBoard(db: Db) {
  const bus = createInProcessEventBus();
  const host = MOCKUP_PEOPLE.find((p) => p.role === 'host');
  const board = await createEvent(db, clock, {
    ...friendsgivingPayload(clock.now()),
    startsAt: '2026-11-21T17:00:00.000Z',
    hostName: host?.displayName ?? 'Mina',
    hostDietaryNeeds: host?.dietaryNeeds ?? [],
    slots: MOCKUP_SLOTS,
  });
  const actors = new Map<string, Actor>([
    [
      host?.displayName ?? 'Mina',
      { eventId: board.eventId, participantId: board.hostParticipantId, role: 'host' },
    ],
  ]);
  for (const guest of MOCKUP_PEOPLE.filter((p) => p.role === 'guest')) {
    const joined = await joinGuest(db, board, guest.displayName, guest.dietaryNeeds);
    actors.set(guest.displayName, {
      eventId: board.eventId,
      participantId: joined.participantId,
      role: 'guest',
    });
  }
  const rows = await db.orm
    .select({ id: slots.id, category: slots.category, position: slots.position })
    .from(slots)
    .where(eq(slots.eventId, board.eventId));
  for (const c of MOCKUP_CLAIMS) {
    const slot = rows.find((r) => r.category === c.category && r.position === c.position);
    const actor = actors.get(c.by);
    if (!slot || !actor) throw new Error(`mockup claim ${c.dishName} has no slot or claimant`);
    await claimSlot(db, clock, bus, actor, slot.id, {
      dishName: c.dishName,
      dishTags: c.dishTags,
    });
  }
  return board;
}
