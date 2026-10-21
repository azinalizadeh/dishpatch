import { friendsgivingPayload } from '../../../../packages/shared/test/fixtures/create-event.ts';
import type { Db } from '../../src/db/client.ts';
import { createEvent } from '../../src/domain/events.ts';
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
