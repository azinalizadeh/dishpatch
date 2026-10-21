import type { BoardEvent } from '@dishpatch/shared';

/** In-process fan-out from the write path to the SSE hub (one API instance; no LISTEN/NOTIFY). */
export interface EventBus {
  publish(eventId: string, msg: BoardEvent): void;
  subscribe(eventId: string, fn: (msg: BoardEvent) => void): () => void;
}

/** `onError` hears about a subscriber that threw; publishing carries on to the others. */
export function createInProcessEventBus(onError: (err: unknown) => void = () => {}): EventBus {
  const subscribers = new Map<string, Set<(msg: BoardEvent) => void>>();
  return {
    publish(eventId, msg) {
      // Copy first: a subscriber may unsubscribe while handling (a stream closing on event.deleted).
      // Publishing runs after COMMIT, so a failing subscriber must not fail the write.
      for (const fn of [...(subscribers.get(eventId) ?? [])]) {
        try {
          fn(msg);
        } catch (err) {
          onError(err);
        }
      }
    },
    subscribe(eventId, fn) {
      const set = subscribers.get(eventId) ?? new Set();
      set.add(fn);
      subscribers.set(eventId, set);
      return () => {
        set.delete(fn);
        if (set.size === 0) subscribers.delete(eventId);
      };
    },
  };
}
