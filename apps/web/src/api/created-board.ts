import type { CreateEventInput, CreateEventResponse } from '@dishpatch/shared';

/** What the share screen shows right after create. */
export interface CreatedBoard extends CreateEventResponse {
  title: string;
  startsAt: string;
  slotCount: number;
}

// Held in memory only: the host link must never reach localStorage, sessionStorage or
// history.state (07-security.md › I2). A reload drops it, by design.
let current: CreatedBoard | null = null;

export function rememberCreatedBoard(input: CreateEventInput, response: CreateEventResponse) {
  current = {
    ...response,
    title: input.title,
    startsAt: input.startsAt,
    slotCount: input.slots.reduce((sum, s) => sum + s.count, 0),
  };
}

export function createdBoard(eventId: string | undefined): CreatedBoard | null {
  return current && current.eventId === eventId ? current : null;
}

export function forgetCreatedBoard() {
  current = null;
}
