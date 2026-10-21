import { LIMITS } from '@dishpatch/shared';
import { eq } from 'drizzle-orm';
import { describe, expect, it } from 'vitest';
import { friendsgivingPayload } from '../../../packages/shared/test/fixtures/create-event.ts';
import { eventLog, events, participants, sessions } from '../src/db/schema.ts';
import { DomainError } from '../src/domain/errors.ts';
import { createEvent } from '../src/domain/events.ts';
import { joinEvent, previewInvite } from '../src/domain/participants.ts';
import { generateToken, hashToken } from '../src/domain/tokens.ts';
import { type BusMessage, createInProcessEventBus } from '../src/realtime/event-bus.ts';
import { useTestDb } from './helpers/int-app.ts';
import { fixedClock } from './helpers/test-app.ts';

const clock = fixedClock('2026-10-20T12:00:00Z');
const afterExpiry = fixedClock('2026-12-06T00:00:00Z');
const input = () => ({
  ...friendsgivingPayload(clock.now()),
  startsAt: '2026-11-21T17:00:00.000Z',
});

async function domainError(promise: Promise<unknown>): Promise<DomainError> {
  const err = await promise.then(
    () => undefined,
    (e: unknown) => e,
  );
  if (!(err instanceof DomainError)) throw new Error(`expected a DomainError, got ${String(err)}`);
  return err;
}

describe('participant service', () => {
  const db = useTestDb();

  it('join creates a guest participant and a session hash', async () => {
    const created = await createEvent(db, clock, input());
    const bus = createInProcessEventBus();
    const published: BusMessage[] = [];
    bus.subscribe(created.eventId, (m) => published.push(m));

    const joined = await joinEvent(db, clock, bus, created.inviteToken, {
      displayName: 'Sam',
      dietaryNeeds: ['vegan'],
    });

    expect(joined.eventId).toBe(created.eventId);
    const [guest] = await db.orm
      .select()
      .from(participants)
      .where(eq(participants.id, joined.participantId));
    expect(guest).toMatchObject({ displayName: 'Sam', dietaryNeeds: ['vegan'], role: 'guest' });

    const [session] = await db.orm
      .select()
      .from(sessions)
      .where(eq(sessions.participantId, joined.participantId));
    expect(session?.tokenHash.equals(hashToken(joined.sessionToken))).toBe(true);
    expect(session?.expiresAt).toEqual(created.expiresAt);

    // The join is a board mutation: seq + 1, one log row, published after commit.
    const [event] = await db.orm.select().from(events);
    expect(event?.seq).toBe(1);
    const log = await db.orm.select().from(eventLog);
    expect(log).toMatchObject([{ seq: 1, type: 'participant.joined' }]);
    expect(published).toEqual([
      {
        type: 'participant.joined',
        seq: 1,
        participant: {
          id: joined.participantId,
          displayName: 'Sam',
          dietaryNeeds: ['vegan'],
          role: 'guest',
        },
      },
    ]);
  });

  it('join on an expired event throws INVITE_INVALID', async () => {
    const created = await createEvent(db, clock, input());
    const bus = createInProcessEventBus();
    for (const [at, token] of [
      [afterExpiry, created.inviteToken],
      [clock, generateToken()],
      [clock, created.hostToken],
      [clock, 'not-a-token'],
    ] as const) {
      const err = await domainError(
        joinEvent(db, at, bus, token, { displayName: 'Sam', dietaryNeeds: [] }),
      );
      expect(err.code).toBe('INVITE_INVALID');
    }
    expect(await db.orm.select().from(participants)).toHaveLength(1);
  });

  it('101st participant gets EVENT_FULL', async () => {
    const created = await createEvent(db, clock, input());
    const bus = createInProcessEventBus();
    // The host is participant 1.
    await db.orm.insert(participants).values(
      Array.from({ length: LIMITS.participantsMax - 1 }, (_, i) => ({
        eventId: created.eventId,
        displayName: `Guest ${i}`,
        role: 'guest' as const,
      })),
    );

    const err = await domainError(
      joinEvent(db, clock, bus, created.inviteToken, { displayName: 'Late', dietaryNeeds: [] }),
    );
    expect(err.code).toBe('EVENT_FULL');
    expect(await db.orm.select().from(participants)).toHaveLength(LIMITS.participantsMax);
  });

  it('a case-insensitive duplicate name throws NAME_TAKEN with the stored name', async () => {
    const created = await createEvent(db, clock, input());
    const bus = createInProcessEventBus();
    await joinEvent(db, clock, bus, created.inviteToken, { displayName: 'Sam', dietaryNeeds: [] });
    const err = await domainError(
      joinEvent(db, clock, bus, created.inviteToken, { displayName: 'sAM', dietaryNeeds: [] }),
    );
    expect(err.code).toBe('NAME_TAKEN');
    expect(err.message).toBe('Someone called Sam is already here — add an initial?');
    const [event] = await db.orm.select().from(events);
    expect(event?.seq).toBe(1);
  });

  it('concurrent joins with the same name let exactly one in', async () => {
    const created = await createEvent(db, clock, input());
    const bus = createInProcessEventBus();
    const results = await Promise.allSettled(
      Array.from({ length: 5 }, () =>
        joinEvent(db, clock, bus, created.inviteToken, { displayName: 'Jo', dietaryNeeds: [] }),
      ),
    );
    expect(results.filter((r) => r.status === 'fulfilled')).toHaveLength(1);
    for (const r of results) {
      if (r.status === 'rejected') expect((r.reason as DomainError).code).toBe('NAME_TAKEN');
    }
  });

  it('previewInvite returns title, date, location, host name and count only', async () => {
    const created = await createEvent(db, clock, input());
    const bus = createInProcessEventBus();
    await joinEvent(db, clock, bus, created.inviteToken, { displayName: 'Sam', dietaryNeeds: [] });

    expect(await previewInvite(db, clock, created.inviteToken)).toEqual({
      title: input().title,
      startsAt: '2026-11-21T17:00:00.000Z',
      location: input().location ?? null,
      hostName: input().hostName,
      participantCount: 2,
    });
    const err = await domainError(previewInvite(db, afterExpiry, created.inviteToken));
    expect(err.code).toBe('INVITE_INVALID');
  });
});
