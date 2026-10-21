import type { Snapshot } from '@dishpatch/shared';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { act, cleanup, renderHook, waitFor } from '@testing-library/react';
import type { ReactNode } from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { useBoardStream } from '../src/api/use-board-stream.ts';
import { FakeEventSource, installFakeEventSource } from './fake-event-source.ts';

const eventId = '0b5a4c1e-8a57-4d4b-9f4c-2f1b8e7a9c11';
const hostId = '5d1f8a3e-2c4b-4e6f-8a9b-1c2d3e4f5a6b';
const guestId = '6e2f9b4d-3d5c-4f7a-9b0c-2d3e4f5a6b7c';

const snapshot = (seq: number): Snapshot => ({
  event: {
    id: eventId,
    title: 'Friendsgiving',
    startsAt: '2026-11-21T17:00:00.000Z',
    location: null,
    locked: false,
  },
  slots: [],
  participants: [{ id: hostId, displayName: 'Mina', dietaryNeeds: [], role: 'host' }],
  coverage: [],
  me: { participantId: hostId, role: 'host' },
  seq,
});

function renderStream() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  const wrapper = ({ children }: { children: ReactNode }) => (
    <QueryClientProvider client={client}>{children}</QueryClientProvider>
  );
  return renderHook(() => useBoardStream(eventId), { wrapper });
}

describe('useBoardStream', () => {
  beforeEach(() => {
    installFakeEventSource();
  });
  afterEach(() => {
    cleanup();
    vi.useRealTimers();
    vi.unstubAllGlobals();
  });

  it('switches to reconnecting after 2 s of error and back to live on open', async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => Response.json(snapshot(4))),
    );
    const { result } = renderStream();
    await waitFor(() => expect(FakeEventSource.instances).toHaveLength(1));
    const source = FakeEventSource.latest();
    expect(source.url).toBe(`/api/events/${eventId}/stream?after=4`);

    act(() => source.open());
    expect(result.current.connection).toBe('live');

    act(() => source.fail());
    act(() => vi.advanceTimersByTime(1_900));
    expect(result.current.connection).toBe('live');
    act(() => vi.advanceTimersByTime(200));
    expect(result.current.connection).toBe('reconnecting');

    act(() => source.open());
    expect(result.current.connection).toBe('live');
  });

  it('pauses when the browser goes offline and reopens from the current seq when back', async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => Response.json(snapshot(4))),
    );
    const { result } = renderStream();
    await waitFor(() => expect(FakeEventSource.instances).toHaveLength(1));
    const first = FakeEventSource.latest();
    act(() => {
      first.open();
      first.emit({
        type: 'participant.joined',
        seq: 5,
        participant: { id: guestId, displayName: 'Reza', dietaryNeeds: [], role: 'guest' },
      });
    });

    act(() => {
      window.dispatchEvent(new Event('offline'));
    });
    expect(first.readyState).toBe(FakeEventSource.CLOSED);
    act(() => vi.advanceTimersByTime(2_000));
    expect(result.current.connection).toBe('reconnecting');

    act(() => {
      window.dispatchEvent(new Event('online'));
    });
    await waitFor(() => expect(FakeEventSource.instances).toHaveLength(2));
    expect(FakeEventSource.latest().url).toBe(`/api/events/${eventId}/stream?after=5`);
    act(() => FakeEventSource.latest().open());
    expect(result.current.connection).toBe('live');
  });

  it('applies events in seq order, ignores replays and tracks presence', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => Response.json(snapshot(4))),
    );
    const { result } = renderStream();
    await waitFor(() => expect(FakeEventSource.instances).toHaveLength(1));
    const source = FakeEventSource.latest();
    const joined = {
      type: 'participant.joined',
      seq: 5,
      participant: { id: guestId, displayName: 'Reza', dietaryNeeds: [], role: 'guest' },
    };

    act(() => {
      source.open();
      source.emit({ type: 'presence', count: 2 });
      source.emit({ ...joined, seq: 4 }); // already in the snapshot
      source.emit(joined);
      source.emit(joined); // duplicate delivery
    });

    expect(result.current.presence).toBe(2);
    expect(result.current.board?.seq).toBe(5);
    expect(result.current.board?.participants.map((p) => p.displayName)).toEqual(['Mina', 'Reza']);
    expect(result.current.announcement).toBe('Reza joined the board');
  });

  it('refetches the snapshot on resync', async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(Response.json(snapshot(4)))
      .mockResolvedValueOnce(Response.json(snapshot(40)));
    vi.stubGlobal('fetch', fetchMock);
    const { result } = renderStream();
    await waitFor(() => expect(FakeEventSource.instances).toHaveLength(1));
    const first = FakeEventSource.latest();

    act(() => {
      first.open();
      first.emit({ type: 'resync' });
    });

    expect(first.readyState).toBe(FakeEventSource.CLOSED);
    await waitFor(() => expect(result.current.board?.seq).toBe(40));
    expect(fetchMock).toHaveBeenCalledTimes(2);
    // A fresh stream resumes from the new snapshot's seq.
    await waitFor(() => expect(FakeEventSource.instances).toHaveLength(2));
    expect(FakeEventSource.latest().url).toBe(`/api/events/${eventId}/stream?after=40`);
  });

  it('reports notfound when the board is deleted or the session is gone', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => Response.json(snapshot(1))),
    );
    const { result } = renderStream();
    await waitFor(() => expect(FakeEventSource.instances).toHaveLength(1));
    act(() => FakeEventSource.latest().emit({ type: 'event.deleted' }));
    expect(result.current.connection).toBe('notfound');

    vi.stubGlobal(
      'fetch',
      vi.fn(async () =>
        Response.json(
          { error: { code: 'NOT_FOUND', message: 'Nope.', requestId: 'r' } },
          { status: 404 },
        ),
      ),
    );
    const other = renderStream();
    await waitFor(() => expect(other.result.current.connection).toBe('notfound'));
  });

  it('throttles announcements to one per 2 s and joins the ones in between', async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => Response.json(snapshot(0))),
    );
    const { result } = renderStream();
    await waitFor(() => expect(FakeEventSource.instances).toHaveLength(1));
    const source = FakeEventSource.latest();
    const join = (seq: number, name: string) =>
      source.emit({
        type: 'participant.joined',
        seq,
        participant: {
          id: `00000000-0000-4000-8000-00000000000${seq}`,
          displayName: name,
          dietaryNeeds: [],
          role: 'guest',
        },
      });

    act(() => {
      join(1, 'Ana');
      join(2, 'Ben');
      join(3, 'Cy');
    });
    expect(result.current.announcement).toBe('Ana joined the board');
    act(() => vi.advanceTimersByTime(1_000));
    expect(result.current.announcement).toBe('Ana joined the board');
    act(() => vi.advanceTimersByTime(1_000));
    expect(result.current.announcement).toBe('Ben joined the board. Cy joined the board');
  });
});
