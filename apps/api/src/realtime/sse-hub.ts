import { type BoardEvent, isSequenced } from '@dishpatch/shared';
import type { Response } from 'express';
import { tooManyStreams } from '../domain/errors.ts';
import type { EventBus } from './event-bus.ts';
import type { EventLogRepo } from './event-log.ts';

export interface SseHubOptions {
  bus: EventBus;
  log: EventLogRepo;
  heartbeatMs?: number;
  presenceThrottleMs?: number;
  maxPerSession?: number;
  maxPerIp?: number;
  /** Hears about a replay or gap-fill that failed (the client is told to resync). */
  onError?: (err: unknown) => void;
}

export interface StreamRequest {
  eventId: string;
  /** Opaque key of the caller's session (a hash, never the raw token). */
  sessionKey: string;
  ip: string;
  /** Last seq the client has, from `Last-Event-ID` or the first connect's `?after=`. */
  afterSeq: number | undefined;
}

export interface SseHub {
  /** Throws TOO_MANY_STREAMS before any byte is written; otherwise streams until the client leaves. */
  open(req: StreamRequest, res: Response): Promise<void>;
  /** Open streams for a board (the presence count). */
  count(eventId: string): number;
  /** Ends every stream (shutdown); EventSource reconnects to the next instance. */
  closeAll(): void;
}

interface Connection {
  eventId: string;
  sessionKey: string;
  ip: string;
  res: Response;
  close: () => void;
}

/** One SSE frame. Sequenced events carry `id: seq` so the browser resumes with `Last-Event-ID`. */
function frame(msg: BoardEvent): string {
  const id = isSequenced(msg) ? `id: ${msg.seq}\n` : '';
  return `${id}event: ${msg.type}\ndata: ${JSON.stringify(msg)}\n\n`;
}

/**
 * The hand-written SSE writer (04-architecture.md › Stack › Real-time). Holds every open stream,
 * replays from the event log on reconnect, fans out bus events, sends presence and heartbeats,
 * and enforces the per-session / per-IP stream limits (07-security.md › D1).
 */
export function createSseHub({
  bus,
  log,
  heartbeatMs = 20_000,
  presenceThrottleMs = 5_000,
  maxPerSession = 5,
  maxPerIp = 20,
  onError = () => {},
}: SseHubOptions): SseHub {
  const connections = new Set<Connection>();
  const presence = new Map<
    string,
    { lastSentAt: number; lastCount: number; timer: NodeJS.Timeout | null }
  >();

  const ofEvent = (eventId: string) => [...connections].filter((c) => c.eventId === eventId);
  const countWhere = (pred: (c: Connection) => boolean) => [...connections].filter(pred).length;

  function broadcastPresence(eventId: string) {
    const state = presence.get(eventId);
    if (!state) return;
    state.timer = null;
    const conns = ofEvent(eventId);
    if (conns.length === 0) {
      presence.delete(eventId);
      return;
    }
    if (conns.length === state.lastCount) return;
    state.lastCount = conns.length;
    state.lastSentAt = Date.now();
    const data = frame({ type: 'presence', count: conns.length });
    for (const c of conns) c.res.write(data);
  }

  /** At most one presence broadcast per board per throttle window, and only when the count changed. */
  function presenceChanged(eventId: string) {
    const state = presence.get(eventId) ?? { lastSentAt: 0, lastCount: -1, timer: null };
    presence.set(eventId, state);
    if (state.timer) return;
    const wait = Math.max(0, state.lastSentAt + presenceThrottleMs - Date.now());
    if (wait === 0) broadcastPresence(eventId);
    else state.timer = setTimeout(() => broadcastPresence(eventId), wait);
  }

  async function open(req: StreamRequest, res: Response): Promise<void> {
    if (
      countWhere((c) => c.sessionKey === req.sessionKey) >= maxPerSession ||
      countWhere((c) => c.ip === req.ip) >= maxPerIp
    ) {
      throw tooManyStreams();
    }

    res.status(200);
    res.set({
      'Content-Type': 'text/event-stream; charset=utf-8',
      'Cache-Control': 'no-cache, no-transform',
      Connection: 'keep-alive',
      // Stop reverse proxies (nginx and friends) from buffering the stream.
      'X-Accel-Buffering': 'no',
    });
    res.flushHeaders();
    res.write('retry: 3000\n\n');

    // The last seq this client has; undefined = it asked for live events only.
    let lastSeq = req.afterSeq;
    let closed = false;

    const write = (msg: BoardEvent) => {
      if (closed) return;
      if (isSequenced(msg)) lastSeq = msg.seq;
      res.write(frame(msg));
      if (msg.type === 'event.deleted') conn.close();
    };

    /** Everything the client missed after `lastSeq`, from the log; `resync` if it's gone. */
    const catchUp = async () => {
      const missed = await log.since(req.eventId, lastSeq ?? 0);
      if (missed === 'too_old') {
        // The client must refetch the snapshot and reconnect from its seq.
        write({ type: 'resync' });
        conn.close();
        return;
      }
      for (const msg of missed) if (lastSeq === undefined || msg.seq > lastSeq) write(msg);
    };

    // One delivery at a time, in order: the replay, then each live event. Live events that
    // arrive during the replay wait their turn and are dropped by seq if the replay sent them.
    let queue = Promise.resolve();
    const deliver = (work: () => void | Promise<void>) => {
      queue = queue.then(work).catch((err: unknown) => {
        // Don't fail silently into a reconnect loop: log it, and have the client start over
        // from a fresh snapshot.
        onError(err);
        write({ type: 'resync' });
        conn.close();
      });
      return queue;
    };

    const unsubscribe = bus.subscribe(req.eventId, (msg) => {
      void deliver(async () => {
        if (closed) return;
        if (isSequenced(msg) && lastSeq !== undefined) {
          if (msg.seq <= lastSeq) return; // duplicate, or already replayed
          // Publishes from two commits can reach the bus out of order: fill the gap from the
          // log (which already holds this event) instead of skipping ahead.
          if (msg.seq > lastSeq + 1) return catchUp();
        }
        write(msg);
      });
    });
    const heartbeat = setInterval(() => res.write(': ping\n\n'), heartbeatMs);

    const conn: Connection = {
      eventId: req.eventId,
      sessionKey: req.sessionKey,
      ip: req.ip,
      res,
      close: () => {
        if (closed) return;
        closed = true;
        clearInterval(heartbeat);
        unsubscribe();
        connections.delete(conn);
        presenceChanged(req.eventId);
        res.end();
      },
    };
    connections.add(conn);
    res.on('close', conn.close);

    // The newcomer learns the count at once; everyone else gets the throttled broadcast.
    res.write(frame({ type: 'presence', count: ofEvent(req.eventId).length }));
    presenceChanged(req.eventId);

    if (req.afterSeq !== undefined) await deliver(catchUp);
  }

  return {
    open,
    count: (eventId) => ofEvent(eventId).length,
    closeAll: () => {
      for (const c of [...connections]) c.close();
    },
  };
}
