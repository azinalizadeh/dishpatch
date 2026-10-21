import {
  applyBoardEvent,
  BoardEvent,
  type BoardEventType,
  type SequencedBoardEvent,
  type Snapshot,
} from '@dishpatch/shared';
import { useQueryClient } from '@tanstack/react-query';
import { useCallback, useEffect, useRef, useState } from 'react';
import { CATEGORY_LABELS } from '../categories.ts';
import { boardKey, isNotFound, useBoardSnapshot } from './queries.ts';

/** live → (error for 2 s) → reconnecting → (open) → live; a 404 or a deleted board → notfound. */
export type Connection = 'connecting' | 'live' | 'reconnecting' | 'notfound';

export const RECONNECTING_AFTER_MS = 2_000;
export const ANNOUNCE_EVERY_MS = 2_000;
/** Matches the server's `retry: 3000`, for streams the browser won't retry by itself. */
const REOPEN_AFTER_MS = 3_000;

const STREAM_EVENTS: BoardEventType[] = [
  'slot.claimed',
  'slot.released',
  'slot.added',
  'slot.removed',
  'participant.joined',
  'event.updated',
  'presence',
  'resync',
  'event.deleted',
];

/** What the polite live region says about a change (03-design.md › board › Accessibility). */
export function describeChange(msg: SequencedBoardEvent, before: Snapshot): string | null {
  switch (msg.type) {
    case 'slot.claimed': {
      const who = msg.slot.claimedBy?.displayName ?? 'Someone';
      return `${who} claimed ${msg.slot.dishName ?? 'a dish'} in ${CATEGORY_LABELS[msg.slot.category].plural}`;
    }
    case 'slot.released': {
      const slot = before.slots.find((s) => s.id === msg.slotId);
      return slot ? `A ${CATEGORY_LABELS[slot.category].plural} slot opened up` : null;
    }
    case 'participant.joined':
      return `${msg.participant.displayName} joined the board`;
    case 'event.updated':
      return msg.locked ? 'The host locked the board' : 'The host reopened the board';
    default:
      return null;
  }
}

/**
 * At most one announcement per `everyMs`; changes that arrive in between are joined into the
 * next one, so a busy board doesn't flood screen readers and nothing is dropped.
 */
export function useThrottledAnnouncer(everyMs = ANNOUNCE_EVERY_MS) {
  const [text, setText] = useState('');
  const lastAt = useRef(Number.NEGATIVE_INFINITY);
  const pending = useRef<string[]>([]);
  const timer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);

  useEffect(() => () => clearTimeout(timer.current), []);

  const announce = useCallback(
    (message: string) => {
      pending.current.push(message);
      if (timer.current !== undefined) return;
      const flush = () => {
        timer.current = undefined;
        lastAt.current = Date.now();
        setText(pending.current.splice(0).join('. '));
      };
      const wait = lastAt.current + everyMs - Date.now();
      if (wait <= 0) flush();
      else timer.current = setTimeout(flush, wait);
    },
    [everyMs],
  );

  return [text, announce] as const;
}

/**
 * The live board (F3.5): the snapshot from TanStack Query, kept current by an EventSource whose
 * events are applied with the shared `applyBoardEvent` (anything with `seq <= current` is ignored).
 */
export function useBoardStream(eventId: string) {
  const queryClient = useQueryClient();
  const query = useBoardSnapshot(eventId);
  const [connection, setConnection] = useState<Connection>('connecting');
  const [presence, setPresence] = useState<number | null>(null);
  const [deleted, setDeleted] = useState(false);
  const [announcement, announce] = useThrottledAnnouncer();
  // Bumped to open a fresh stream (after a resync or a stream the browser gave up on).
  const [epoch, setEpoch] = useState(0);
  const ready = query.data !== undefined;

  // biome-ignore lint/correctness/useExhaustiveDependencies: bumping `epoch` is how a fresh stream is opened.
  useEffect(() => {
    if (!ready || deleted) return;
    const key = boardKey(eventId);
    const seq = queryClient.getQueryData<Snapshot>(key)?.seq ?? 0;
    const source = new EventSource(
      `/api/events/${encodeURIComponent(eventId)}/stream?after=${seq}`,
    );
    let errorTimer: ReturnType<typeof setTimeout> | undefined;
    let reopenTimer: ReturnType<typeof setTimeout> | undefined;
    let disposed = false;

    const reopenAfter = (ms: number) => {
      source.close();
      reopenTimer = setTimeout(() => {
        if (!disposed) setEpoch((n) => n + 1);
      }, ms);
    };

    source.onopen = () => {
      clearTimeout(errorTimer);
      errorTimer = undefined;
      setConnection('live');
    };

    source.onerror = () => {
      errorTimer ??= setTimeout(() => setConnection('reconnecting'), RECONNECTING_AFTER_MS);
      if (source.readyState === EventSource.CLOSED) {
        // The server refused the stream (404, 429): recheck membership, then try again.
        void queryClient.invalidateQueries({ queryKey: key });
        reopenAfter(REOPEN_AFTER_MS);
      }
    };

    const onMessage = (e: MessageEvent<string>) => {
      let data: unknown;
      try {
        data = JSON.parse(e.data);
      } catch {
        return;
      }
      const parsed = BoardEvent.safeParse(data);
      if (!parsed.success) return;
      const msg = parsed.data;

      switch (msg.type) {
        case 'presence':
          setPresence(msg.count);
          return;
        case 'resync':
          // Too far behind to replay: reload the snapshot, then stream from its seq.
          source.close();
          void queryClient.refetchQueries({ queryKey: key }).then(() => {
            if (!disposed) setEpoch((n) => n + 1);
          });
          return;
        case 'event.deleted':
          source.close();
          setDeleted(true);
          return;
        default: {
          const before = queryClient.getQueryData<Snapshot>(key);
          if (!before) return;
          const after = applyBoardEvent(before, msg);
          if (after === before) return;
          queryClient.setQueryData(key, after);
          const said = describeChange(msg, before);
          if (said) announce(said);
        }
      }
    };
    for (const type of STREAM_EVENTS) source.addEventListener(type, onMessage);

    return () => {
      disposed = true;
      clearTimeout(errorTimer);
      clearTimeout(reopenTimer);
      source.close();
    };
  }, [eventId, ready, deleted, epoch, queryClient, announce]);

  return {
    query,
    board: query.data,
    connection: deleted || isNotFound(query.error) ? ('notfound' as const) : connection,
    presence,
    announcement,
  };
}
