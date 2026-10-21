import type { Snapshot } from '@dishpatch/shared';
import { act, cleanup, screen, waitFor, within } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { FakeEventSource } from './fake-event-source.ts';
import { renderRoutes } from './render-routes.tsx';

const eventId = '0b5a4c1e-8a57-4d4b-9f4c-2f1b8e7a9c11';
const hostId = '5d1f8a3e-2c4b-4e6f-8a9b-1c2d3e4f5a6b';
const guestId = '6e2f9b4d-3d5c-4f7a-9b0c-2d3e4f5a6b7c';
const slotId = (n: number) => `00000000-0000-4000-8000-0000000000${String(n).padStart(2, '0')}`;

function snapshot(overrides: Partial<Snapshot> = {}): Snapshot {
  return {
    event: {
      id: eventId,
      title: "Friendsgiving at Mina's",
      startsAt: '2026-11-21T17:00:00.000Z',
      location: "Mina's flat, 3rd floor",
      locked: false,
    },
    slots: [
      {
        id: slotId(1),
        category: 'main',
        position: 0,
        claimedBy: null,
        dishName: null,
        dishTags: [],
      },
      {
        id: slotId(2),
        category: 'main',
        position: 1,
        claimedBy: null,
        dishName: null,
        dishTags: [],
      },
      {
        id: slotId(3),
        category: 'dessert',
        position: 0,
        claimedBy: null,
        dishName: null,
        dishTags: [],
      },
    ],
    participants: [
      { id: hostId, displayName: 'Mina', dietaryNeeds: [], role: 'host' },
      { id: guestId, displayName: 'Reza', dietaryNeeds: ['halal'], role: 'guest' },
    ],
    me: { participantId: guestId, role: 'guest' },
    seq: 3,
    ...overrides,
  };
}

const claimedMain = {
  id: slotId(1),
  category: 'main' as const,
  position: 0,
  claimedBy: { id: guestId, displayName: 'Reza' },
  dishName: 'Ghormeh sabzi',
  dishTags: ['halal' as const],
};

function serve(body: unknown, status = 200) {
  vi.stubGlobal(
    'fetch',
    vi.fn(async () => Response.json(body, { status })),
  );
}

const renderBoard = () => renderRoutes(`/events/${eventId}`);

describe('BoardScreen', () => {
  afterEach(() => {
    cleanup();
    vi.useRealTimers();
    vi.unstubAllGlobals();
  });

  it('renders skeleton while loading', () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(() => new Promise<Response>(() => {})),
    );
    renderBoard();
    expect(screen.getByRole('status', { name: 'Loading the board' })).toBeTruthy();
    expect(screen.queryByText(/claimed$/)).toBeNull();
  });

  it('renders empty banner when nothing is claimed', async () => {
    serve(snapshot());
    renderBoard();
    expect(await screen.findByText(/Nothing claimed yet/)).toBeTruthy();
    expect(screen.getByText('0 of 3 claimed')).toBeTruthy();
    const mains = screen.getByRole('region', { name: 'Mains' });
    expect(within(mains).getByText('0/2')).toBeTruthy();
    expect(within(mains).getByRole('button', { name: 'Claim open Mains slot 2' })).toBeTruthy();
  });

  it('shows claimed stickers, counts and the guest list', async () => {
    serve(snapshot({ slots: [claimedMain, ...snapshot().slots.slice(1)] }));
    renderBoard();
    expect(
      await screen.findByRole('article', {
        name: 'Mains slot 1: Ghormeh sabzi, brought by Reza',
      }),
    ).toBeTruthy();
    expect(screen.queryByText(/Nothing claimed yet/)).toBeNull();
    expect(screen.getByText('1 of 3 claimed')).toBeTruthy();
    const guests = screen.getByRole('list', { name: "Who's coming" });
    expect(within(guests).getByText('Reza (you)')).toBeTruthy();
    expect(within(guests).getByText('Host')).toBeTruthy();
  });

  it('open slots are disabled and show Paused when reconnecting', async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    serve(snapshot());
    renderBoard();
    await screen.findByText(/Nothing claimed yet/);
    const source = FakeEventSource.latest();
    act(() => {
      source.open();
      source.emit({ type: 'presence', count: 2 });
    });
    expect(screen.getByText('Live · 2 here')).toBeTruthy();
    const open = screen.getByRole('button', {
      name: 'Claim open Mains slot 1',
    }) as HTMLButtonElement;
    expect(open.disabled).toBe(false);

    act(() => source.fail());
    act(() => vi.advanceTimersByTime(2_000));

    expect(screen.getByText('Reconnecting…')).toBeTruthy();
    expect(screen.getByText(/Connection lost\. Reconnecting…/)).toBeTruthy();
    expect(open.disabled).toBe(true);
    expect(within(open).getByText('Paused')).toBeTruthy();

    act(() => source.open());
    expect(open.disabled).toBe(false);
  });

  it('shows Closed and the locked banner on a locked board', async () => {
    serve(snapshot({ event: { ...snapshot().event, locked: true } }));
    renderBoard();
    expect(await screen.findByText(/Mina locked the board/)).toBeTruthy();
    const open = screen.getByRole('button', {
      name: 'Claim open Desserts slot 1',
    }) as HTMLButtonElement;
    expect(open.disabled).toBe(true);
    expect(within(open).getByText('Closed')).toBeTruthy();
  });

  it('updates live and announces the change politely', async () => {
    serve(snapshot());
    renderBoard();
    await screen.findByText(/Nothing claimed yet/);
    act(() => {
      FakeEventSource.latest().open();
      FakeEventSource.latest().emit({ type: 'slot.claimed', seq: 4, slot: claimedMain });
    });
    expect(
      screen.getByRole('article', { name: 'Mains slot 1: Ghormeh sabzi, brought by Reza' }),
    ).toBeTruthy();
    expect(screen.getByText('1 of 3 claimed')).toBeTruthy();
    await waitFor(() =>
      expect(document.querySelector('[aria-live="polite"]')?.textContent).toBe(
        'Reza claimed Ghormeh sabzi in Mains',
      ),
    );
  });

  it('shows the not-found screen without a session', async () => {
    serve({ error: { code: 'NOT_FOUND', message: 'Nope.', requestId: 'r' } }, 404);
    renderBoard();
    expect(await screen.findByRole('heading', { level: 1 })).toBeTruthy();
    expect(screen.queryByText(/claimed/)).toBeNull();
    expect(FakeEventSource.instances).toHaveLength(0);
  });
});
