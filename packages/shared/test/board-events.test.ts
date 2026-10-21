import { describe, expect, it } from 'vitest';
import {
  applyBoardEvent,
  BoardEvent,
  type SequencedBoardEvent,
  type SlotView,
  type Snapshot,
} from '../src/index.ts';

const HOST = '00000000-0000-4000-8000-000000000001';
const GUEST = '00000000-0000-4000-8000-000000000002';
const SLOT_A = '00000000-0000-4000-8000-0000000000a1';
const SLOT_B = '00000000-0000-4000-8000-0000000000b1';

function openSlot(id: string, position: number): SlotView {
  return {
    id,
    category: 'main',
    position,
    claimedBy: null,
    dishName: null,
    dishTags: [],
  };
}

function board(overrides: Partial<Snapshot> = {}): Snapshot {
  return {
    event: {
      id: '00000000-0000-4000-8000-0000000000e1',
      title: 'Friendsgiving',
      startsAt: '2026-11-26T18:00:00.000Z',
      location: null,
      locked: false,
    },
    slots: [openSlot(SLOT_A, 0), openSlot(SLOT_B, 1)],
    participants: [{ id: HOST, displayName: 'Mina', dietaryNeeds: [], role: 'host' }],
    coverage: [],
    me: { participantId: HOST, role: 'host' },
    seq: 3,
    ...overrides,
  };
}

const claimedA: SlotView = {
  ...openSlot(SLOT_A, 0),
  claimedBy: { id: GUEST, displayName: 'Reza' },
  dishName: 'Ghormeh sabzi',
  dishTags: ['vegan'],
};

describe('applyBoardEvent', () => {
  it('applies slot.claimed and bumps seq', () => {
    const next = applyBoardEvent(board(), { type: 'slot.claimed', seq: 4, slot: claimedA });
    expect(next.seq).toBe(4);
    expect(next.slots[0]).toEqual(claimedA);
    expect(next.slots[1]).toEqual(openSlot(SLOT_B, 1));
  });

  it('ignores an event with seq <= current seq (idempotent replay)', () => {
    const state = board();
    expect(applyBoardEvent(state, { type: 'slot.claimed', seq: 3, slot: claimedA })).toBe(state);
    expect(applyBoardEvent(state, { type: 'slot.claimed', seq: 2, slot: claimedA })).toBe(state);
  });

  it('slot.released clears claimant and dish', () => {
    const state = board({ slots: [claimedA, openSlot(SLOT_B, 1)] });
    const next = applyBoardEvent(state, {
      type: 'slot.released',
      seq: 4,
      slotId: SLOT_A,
      actorRole: 'guest',
    });
    expect(next.slots[0]).toEqual(openSlot(SLOT_A, 0));
    expect(next.seq).toBe(4);
  });

  it('participant.joined appends once even if delivered twice', () => {
    const msg: SequencedBoardEvent = {
      type: 'participant.joined',
      seq: 4,
      participant: { id: GUEST, displayName: 'Reza', dietaryNeeds: ['vegan'], role: 'guest' },
    };
    const once = applyBoardEvent(board(), msg);
    const twice = applyBoardEvent(once, msg);
    expect(twice.participants.map((p) => p.displayName)).toEqual(['Mina', 'Reza']);
    // Same participant again under a newer seq (e.g. replay overlapping a snapshot) still appends once.
    const again = applyBoardEvent(twice, { ...msg, seq: 5 });
    expect(again.participants).toHaveLength(2);
    expect(again.seq).toBe(5);
  });

  it('slot.added inserts in category order and slot.removed drops it', () => {
    const dessert: SlotView = {
      ...openSlot('00000000-0000-4000-8000-0000000000c1', 0),
      category: 'dessert',
    };
    const added = applyBoardEvent(board(), { type: 'slot.added', seq: 4, slot: dessert });
    expect(added.slots.map((s) => s.id)).toEqual([SLOT_A, SLOT_B, dessert.id]);
    const removed = applyBoardEvent(added, { type: 'slot.removed', seq: 5, slotId: SLOT_B });
    expect(removed.slots.map((s) => s.id)).toEqual([SLOT_A, dessert.id]);
  });

  it('event.updated sets locked', () => {
    const next = applyBoardEvent(board(), { type: 'event.updated', seq: 4, locked: true });
    expect(next.event.locked).toBe(true);
  });

  it('leaves state untouched for unsequenced messages (presence, resync, event.deleted)', () => {
    const state = board();
    expect(applyBoardEvent(state, { type: 'presence', count: 2 })).toBe(state);
    expect(applyBoardEvent(state, { type: 'resync' })).toBe(state);
    expect(applyBoardEvent(state, { type: 'event.deleted' })).toBe(state);
  });
});

describe('BoardEvent schema', () => {
  it('parses a participant.joined frame and rejects an unknown type', () => {
    expect(
      BoardEvent.safeParse({
        type: 'participant.joined',
        seq: 7,
        participant: { id: GUEST, displayName: 'Reza', dietaryNeeds: [], role: 'guest' },
      }).success,
    ).toBe(true);
    expect(BoardEvent.safeParse({ type: 'slot.exploded', seq: 1 }).success).toBe(false);
  });
});
