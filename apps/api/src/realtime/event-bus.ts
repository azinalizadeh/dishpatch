/** Placeholder message shape until BoardEvent lands in packages/shared (M4). */
export interface BusMessage {
  type: string;
  [key: string]: unknown;
}

export interface EventBus {
  publish(eventId: string, msg: BusMessage): void;
  subscribe(eventId: string, fn: (msg: BusMessage) => void): () => void;
}

export function createInProcessEventBus(): EventBus {
  const subscribers = new Map<string, Set<(msg: BusMessage) => void>>();
  return {
    publish(eventId, msg) {
      for (const fn of subscribers.get(eventId) ?? []) fn(msg);
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
