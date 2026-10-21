import { z } from 'zod';
import { CATEGORIES } from './categories.ts';
import { ParticipantView, SlotView, type Snapshot } from './schemas.ts';

const Seq = z.number().int().min(1);

/** Changes that are logged in `event_log` and carry the board's `seq` (04-architecture.md › API #6). */
export const SequencedBoardEvent = z.discriminatedUnion('type', [
  z.object({ type: z.literal('slot.claimed'), seq: Seq, slot: SlotView }),
  z.object({ type: z.literal('slot.released'), seq: Seq, slotId: z.uuid() }),
  z.object({ type: z.literal('slot.added'), seq: Seq, slot: SlotView }),
  z.object({ type: z.literal('slot.removed'), seq: Seq, slotId: z.uuid() }),
  z.object({ type: z.literal('participant.joined'), seq: Seq, participant: ParticipantView }),
  z.object({ type: z.literal('event.updated'), seq: Seq, locked: z.boolean() }),
]);

export type SequencedBoardEvent = z.infer<typeof SequencedBoardEvent>;

/** Every message the board stream can carry. `presence`, `resync` and `event.deleted` have no `seq`. */
export const BoardEvent = z.union([
  SequencedBoardEvent,
  z.object({ type: z.literal('presence'), count: z.number().int().min(0) }),
  z.object({ type: z.literal('resync') }),
  z.object({ type: z.literal('event.deleted') }),
]);

export type BoardEvent = z.infer<typeof BoardEvent>;

export type BoardEventType = BoardEvent['type'];

/** The board the client keeps: the snapshot, patched by every sequenced event. */
export type BoardState = Snapshot;

export function isSequenced(msg: BoardEvent): msg is SequencedBoardEvent {
  return 'seq' in msg;
}

const categoryOrder = (slot: SlotView) => CATEGORIES.indexOf(slot.category);

function bySlotOrder(a: SlotView, b: SlotView): number {
  return categoryOrder(a) - categoryOrder(b) || a.position - b.position;
}

/**
 * Applies one stream message to the board. Pure, and idempotent: anything with `seq <= state.seq`
 * (a duplicate, or an event already in the snapshot) returns the same state object.
 * Unsequenced messages leave the board as it is; the caller handles them.
 */
export function applyBoardEvent(state: BoardState, msg: BoardEvent): BoardState {
  if (!isSequenced(msg) || msg.seq <= state.seq) return state;
  const next = { ...state, seq: msg.seq };
  switch (msg.type) {
    case 'slot.claimed':
      return { ...next, slots: state.slots.map((s) => (s.id === msg.slot.id ? msg.slot : s)) };
    case 'slot.released':
      return {
        ...next,
        slots: state.slots.map((s) =>
          s.id === msg.slotId ? { ...s, claimedBy: null, dishName: null, dishTags: [] } : s,
        ),
      };
    case 'slot.added':
      return {
        ...next,
        slots: [...state.slots.filter((s) => s.id !== msg.slot.id), msg.slot].sort(bySlotOrder),
      };
    case 'slot.removed':
      return { ...next, slots: state.slots.filter((s) => s.id !== msg.slotId) };
    case 'participant.joined':
      return state.participants.some((p) => p.id === msg.participant.id)
        ? next
        : { ...next, participants: [...state.participants, msg.participant] };
    case 'event.updated':
      return { ...next, event: { ...state.event, locked: msg.locked } };
  }
}
