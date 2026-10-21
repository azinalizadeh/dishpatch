import { describe, expect, it } from 'vitest';
import { resolveActor } from '../src/middleware/session.ts';
import { fakeDb, fixedClock } from './helpers/test-app.ts';

describe('resolveActor', () => {
  it('returns null for a missing or malformed cookie or event id, without querying', async () => {
    const clock = fixedClock();
    const eventId = '0b5a4c1e-8a57-4d4b-9f4c-2f1b8e7a9c11';
    expect(await resolveActor(fakeDb(), clock, undefined, eventId)).toBeNull();
    expect(await resolveActor(fakeDb(), clock, 'short', eventId)).toBeNull();
    expect(await resolveActor(fakeDb(), clock, 'a'.repeat(43), 'not-a-uuid')).toBeNull();
  });
});
