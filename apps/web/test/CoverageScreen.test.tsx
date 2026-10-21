import { computeCoverage, type Snapshot } from '@dishpatch/shared';
import { act, cleanup, fireEvent, screen, within } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { mockupBoard } from '../../../packages/shared/test/fixtures/mockup-board.ts';
import { FakeEventSource } from './fake-event-source.ts';
import { renderRoutes } from './render-routes.tsx';

const eventId = '0b5a4c1e-8a57-4d4b-9f4c-2f1b8e7a9c11';

function snapshot(overrides: Partial<Snapshot> = {}): Snapshot {
  const { participants, slots } = mockupBoard();
  const priya = participants.find((p) => p.displayName === 'Priya');
  return {
    event: {
      id: eventId,
      title: "Friendsgiving at Mina's",
      startsAt: '2026-11-21T17:00:00.000Z',
      location: null,
      locked: false,
    },
    slots,
    participants,
    coverage: computeCoverage(participants, slots),
    me: { participantId: priya?.id ?? '', role: 'guest' },
    seq: 9,
    ...overrides,
  };
}

function serve(body: Snapshot) {
  vi.stubGlobal(
    'fetch',
    vi.fn(async () => Response.json(body)),
  );
}

const rowNames = () =>
  within(screen.getByRole('list', { name: 'Dietary needs' }))
    .getAllByRole('listitem')
    .map((li) => li.querySelector('span.font-bold')?.textContent);

describe('coverage on the board', () => {
  afterEach(() => {
    cleanup();
    vi.unstubAllGlobals();
  });

  it('puts "Vegan would help" on open mains only when vegan is thin', async () => {
    serve(snapshot());
    renderRoutes(`/events/${eventId}`);
    const mains = await screen.findByRole('region', { name: 'Mains' });
    const openMain = within(mains).getByRole('button', { name: 'Claim open Mains slot 3' });
    expect(within(openMain).getByText('Vegan would help')).toBeTruthy();
    expect(openMain.getAttribute('aria-describedby')).toBeTruthy();
    const sides = screen.getByRole('region', { name: 'Sides' });
    expect(within(sides).queryByText('Vegan would help')).toBeNull();
  });

  it('a gap puts the hint on every open slot', async () => {
    const board = snapshot();
    // Drop the vegans: nut-free (a gap) is now the top need.
    serve({
      ...board,
      participants: board.participants.map((p) =>
        p.dietaryNeeds.includes('vegan') ? { ...p, dietaryNeeds: [] } : p,
      ),
    });
    renderRoutes(`/events/${eventId}`);
    const drinks = await screen.findByRole('region', { name: 'Drinks' });
    expect(within(drinks).getAllByText('Nut-free would help')).toHaveLength(2);
  });

  it('shows the sidebar meter and the mobile summary banner', async () => {
    serve(snapshot());
    renderRoutes(`/events/${eventId}`);
    const card = await screen.findByRole('region', { name: 'Dietary coverage' });
    expect(within(card).getByText('Based on what 6 guests told us.')).toBeTruthy();
    expect(within(card).getByText('No vegan main yet')).toBeTruthy();
    expect(
      within(card)
        .getByRole('link', { name: /Details/ })
        .getAttribute('href'),
    ).toBe(`/events/${eventId}/coverage`);
    const banner = screen.getByRole('link', { name: /See coverage/ });
    expect(banner.textContent).toContain('No vegan main yet · nut-free: nothing yet.');
  });

  it('a hint goes away live when a vegan main is claimed', async () => {
    const board = snapshot();
    serve(board);
    renderRoutes(`/events/${eventId}`);
    await screen.findByText('Vegan would help');
    const openMain = board.slots.find((s) => s.category === 'main' && !s.claimedBy);
    const sam = board.participants.find((p) => p.displayName === 'Sam');
    act(() => {
      FakeEventSource.latest().emit({
        type: 'slot.claimed',
        seq: 10,
        slot: {
          ...openMain,
          claimedBy: { id: sam?.id, displayName: 'Sam' },
          dishName: 'Mushroom pie',
          dishTags: ['vegan'],
        },
      });
    });
    expect(screen.queryByText('Vegan would help')).toBeNull();
    const card = screen.getByRole('region', { name: 'Dietary coverage' });
    expect(within(card).queryByText('No vegan main yet')).toBeNull();
  });
});

describe('CoverageScreen', () => {
  afterEach(() => {
    cleanup();
    vi.unstubAllGlobals();
  });

  it('lists needs gap first, then thin, then covered, with the rules', async () => {
    serve(snapshot());
    renderRoutes(`/events/${eventId}/coverage`);
    await screen.findByRole('list', { name: 'Dietary needs' });
    expect(rowNames()).toEqual(['Nut-free', 'Vegan', 'Halal', 'Gluten-free']);
    expect(screen.getByRole('heading', { name: 'How we decide' })).toBeTruthy();
    expect(screen.getByRole('link', { name: /Back to board/ }).getAttribute('href')).toBe(
      `/events/${eventId}`,
    );
  });

  it('renders the empty state when no guest has needs', async () => {
    const board = snapshot();
    serve({
      ...board,
      participants: board.participants.map((p) => ({ ...p, dietaryNeeds: [] })),
    });
    renderRoutes(`/events/${eventId}/coverage`);
    expect(await screen.findByText(/No one has listed dietary needs yet/)).toBeTruthy();
    expect(screen.queryByRole('heading', { name: 'How we decide' })).toBeNull();
  });

  it('re-sorts live as dishes are claimed', async () => {
    const board = snapshot();
    serve(board);
    renderRoutes(`/events/${eventId}/coverage`);
    await screen.findByRole('list', { name: 'Dietary needs' });
    const openDrink = board.slots.find((s) => s.category === 'drinks' && !s.claimedBy);
    const leila = board.participants.find((p) => p.displayName === 'Leila');
    act(() => {
      FakeEventSource.latest().emit({
        type: 'slot.claimed',
        seq: 10,
        slot: {
          ...openDrink,
          claimedBy: { id: leila?.id, displayName: 'Leila' },
          dishName: 'Doogh',
          dishTags: ['nut_free'],
        },
      });
    });
    // Nut-free is thin now; among thin needs, Vegan (2 guests) goes first.
    expect(rowNames()).toEqual(['Vegan', 'Nut-free', 'Halal', 'Gluten-free']);
    expect(screen.getByText('No nut-free main yet')).toBeTruthy();
  });
});

describe('claim dialog preview', () => {
  afterEach(() => {
    cleanup();
    vi.unstubAllGlobals();
  });

  it('previews the vegan main gap closing as tags are picked', async () => {
    const board = snapshot();
    serve(board);
    renderRoutes(`/events/${eventId}`);
    fireEvent.click(await screen.findByRole('button', { name: 'Claim open Mains slot 3' }));
    const dialog = screen.getByRole('dialog');
    expect(within(dialog).queryByText(/This covers/)).toBeNull();
    fireEvent.click(within(dialog).getByRole('button', { name: 'Vegan' }));
    expect(within(dialog).getByRole('status').textContent).toContain(
      'This covers the vegan main gap for 2 guests.',
    );
    fireEvent.click(within(dialog).getByRole('button', { name: 'Vegan' }));
    expect(within(dialog).queryByText(/This covers/)).toBeNull();
  });
});

describe('coverage on an empty board', () => {
  afterEach(() => {
    cleanup();
    vi.unstubAllGlobals();
  });

  it('a gap puts its hint on every open slot even before anything is claimed (US-11)', async () => {
    const board = snapshot();
    serve({
      ...board,
      slots: board.slots.map((s) => ({ ...s, claimedBy: null, dishName: null, dishTags: [] })),
    });
    renderRoutes(`/events/${eventId}`);
    await screen.findByText(/Nothing claimed yet/);
    // Every need is a gap; Vegan and Halal (2 guests each) tie, and the first listed wins.
    const hints = screen.getAllByText(/would help$/);
    expect(hints).toHaveLength(12);
    // The empty board's own banner replaces the mobile summary.
    expect(screen.queryByRole('link', { name: /See coverage/ })).toBeNull();
  });
});
