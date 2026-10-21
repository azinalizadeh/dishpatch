import type { SlotView, Snapshot } from '@dishpatch/shared';
import { act, cleanup, fireEvent, screen, waitFor, within } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { FakeEventSource } from './fake-event-source.ts';
import { renderRoutes } from './render-routes.tsx';

const eventId = '0b5a4c1e-8a57-4d4b-9f4c-2f1b8e7a9c11';
const hostId = '5d1f8a3e-2c4b-4e6f-8a9b-1c2d3e4f5a6b';
const meId = '6e2f9b4d-3d5c-4f7a-9b0c-2d3e4f5a6b7c';
const jonahId = '7f3a0c5e-4e6d-4a8b-8c1d-3e4f5a6b7c8d';
const slotId = (n: number) => `00000000-0000-4000-8000-0000000000${String(n).padStart(2, '0')}`;

const open = (n: number, position: number, category: SlotView['category'] = 'main'): SlotView => ({
  id: slotId(n),
  category,
  position,
  claimedBy: null,
  dishName: null,
  dishTags: [],
});

function snapshot(slots: SlotView[] = [open(1, 0), open(2, 1), open(3, 2)]): Snapshot {
  return {
    event: {
      id: eventId,
      title: "Friendsgiving at Mina's",
      startsAt: '2026-11-21T17:00:00.000Z',
      location: null,
      locked: false,
    },
    slots,
    participants: [
      { id: hostId, displayName: 'Mina', dietaryNeeds: [], role: 'host' },
      { id: meId, displayName: 'Priya', dietaryNeeds: ['vegan'], role: 'guest' },
      { id: jonahId, displayName: 'Jonah', dietaryNeeds: [], role: 'guest' },
    ],
    coverage: [],
    me: { participantId: meId, role: 'guest' },
    seq: 5,
  };
}

const claimedBy = (slot: SlotView, id: string, displayName: string, dishName: string) => ({
  ...slot,
  claimedBy: { id, displayName },
  dishName,
  dishTags: [],
});

type Handler = (init: RequestInit | undefined) => Response | Promise<Response>;

/** GET serves the snapshot; claim/release calls go to `onMutation`. */
function serve(board: Snapshot, onMutation: Handler) {
  const fetchMock = vi.fn(async (_url: string, init?: RequestInit) =>
    init?.method === 'POST' || init?.method === 'DELETE' ? onMutation(init) : Response.json(board),
  );
  vi.stubGlobal('fetch', fetchMock);
  return fetchMock;
}

async function openDialog(board = snapshot(), onMutation: Handler = () => new Promise(() => {})) {
  const fetchMock = serve(board, onMutation);
  renderRoutes(`/events/${eventId}`);
  const slotButton = await screen.findByRole('button', { name: 'Claim open Mains slot 2' });
  act(() => FakeEventSource.latest().open());
  slotButton.focus();
  fireEvent.click(slotButton);
  const dialog = await screen.findByRole('dialog', { name: 'What are you bringing?' });
  return { dialog, slotButton, fetchMock };
}

function fillAndSubmit(dialog: HTMLElement, dish = 'Mushroom pie') {
  fireEvent.change(within(dialog).getByLabelText('Dish'), { target: { value: dish } });
  fireEvent.click(within(dialog).getByRole('button', { name: 'Vegan' }));
  fireEvent.click(within(dialog).getByRole('button', { name: 'Claim slot' }));
}

describe('ClaimDialog', () => {
  afterEach(() => {
    cleanup();
    vi.unstubAllGlobals();
  });

  it('traps focus and returns it to the slot on close', async () => {
    const { dialog, slotButton } = await openDialog();
    const dish = within(dialog).getByLabelText('Dish');
    expect(document.activeElement).toBe(dish);
    expect(within(dialog).getByText(/main · slot 2 of 3/i)).toBeTruthy();

    // Shift+Tab from the first field wraps to the last button; Tab from there wraps back.
    fireEvent.keyDown(document, { key: 'Tab', shiftKey: true });
    const claimButton = within(dialog).getByRole('button', { name: 'Claim slot' });
    expect(document.activeElement).toBe(claimButton);
    fireEvent.keyDown(document, { key: 'Tab' });
    expect(document.activeElement).toBe(dish);

    fireEvent.keyDown(document, { key: 'Escape' });
    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull());
    expect(document.activeElement).toBe(slotButton);
  });

  it('shows submitting state and disables inputs', async () => {
    const { dialog, fetchMock } = await openDialog();

    fillAndSubmit(dialog);

    const busy = await within(dialog).findByRole('button', { name: 'Claiming…' });
    expect(busy.getAttribute('aria-busy')).toBe('true');
    expect((within(dialog).getByLabelText('Dish') as HTMLInputElement).disabled).toBe(true);
    expect(
      (within(dialog).getByRole('button', { name: /Vegan/ }) as HTMLButtonElement).disabled,
    ).toBe(true);
    // The card is on the board straight away, faded while the claim is in flight (optimistic).
    const card = screen.getByRole('article', {
      name: 'Mains slot 2: Mushroom pie, brought by Priya',
    });
    expect(card.getAttribute('aria-busy')).toBe('true');
    expect(card.className).toContain('opacity-70');
    // A second click while submitting sends nothing.
    fireEvent.click(busy);
    const mutations = fetchMock.mock.calls.filter(([, init]) => init?.method === 'POST');
    expect(mutations).toHaveLength(1);
    expect(JSON.parse(String(mutations[0]?.[1]?.body))).toEqual({
      dishName: 'Mushroom pie',
      dishTags: ['vegan'],
    });
  });

  it('shows an inline error for an empty dish and sends nothing', async () => {
    const { dialog, fetchMock } = await openDialog();
    fireEvent.click(within(dialog).getByRole('button', { name: 'Claim slot' }));
    expect(within(dialog).getByText("Add the dish you're bringing.")).toBeTruthy();
    expect(fetchMock.mock.calls.some(([, init]) => init?.method === 'POST')).toBe(false);
  });

  it('rolls back the optimistic card and shows the winner on 409', async () => {
    const { dialog } = await openDialog(snapshot(), () =>
      Response.json(
        {
          error: {
            code: 'SLOT_TAKEN',
            message: 'Jonah just claimed this slot.',
            requestId: 'r',
            claimedBy: 'Jonah',
          },
        },
        { status: 409 },
      ),
    );

    fillAndSubmit(dialog);

    const alert = await within(dialog).findByRole('alert');
    expect(alert.textContent).toContain(
      'Jonah just claimed this slot. Pick another open main — 2 are still free.',
    );
    expect(screen.queryByRole('article', { name: /Mushroom pie/ })).toBeNull();
    expect(screen.getByRole('button', { name: 'Claim open Mains slot 2' })).toBeTruthy();
    fireEvent.click(within(dialog).getByRole('button', { name: 'Back to board' }));
    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull());
  });

  it('switches to error when an SSE slot.claimed arrives for the open slot', async () => {
    const { dialog } = await openDialog(
      snapshot([open(1, 0), open(2, 1), claimedBy(open(3, 2), hostId, 'Mina', 'Roast')]),
    );

    act(() =>
      FakeEventSource.latest().emit({
        type: 'slot.claimed',
        seq: 6,
        slot: claimedBy(open(2, 1), jonahId, 'Jonah', 'Lentil stew'),
      }),
    );

    expect(within(dialog).getByRole('alert').textContent).toContain(
      'Jonah just claimed this slot. Pick another open main — the first one is still free.',
    );
    expect(within(dialog).getByRole('button', { name: 'Back to board' })).toBeTruthy();
    expect(within(dialog).queryByRole('button', { name: 'Claim slot' })).toBeNull();
  });

  it('keeps the dialog and toasts when the network fails, after rolling back', async () => {
    const { dialog } = await openDialog(snapshot(), () => {
      throw new TypeError('Failed to fetch');
    });

    fillAndSubmit(dialog);

    expect(await screen.findByText("Couldn't reach Dishpatch — try again.")).toBeTruthy();
    expect(within(dialog).getByRole('button', { name: 'Claim slot' })).toBeTruthy();
    expect(screen.queryByRole('article', { name: /Mushroom pie/ })).toBeNull();
  });

  it('closes and keeps the card when the claim succeeds', async () => {
    const won = { ...claimedBy(open(2, 1), meId, 'Priya', 'Mushroom pie'), dishTags: ['vegan'] };
    const { dialog } = await openDialog(snapshot(), () => Response.json({ slot: won, seq: 6 }));

    fillAndSubmit(dialog);

    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull());
    const card = screen.getByRole('article', {
      name: 'Mains slot 2: Mushroom pie, brought by Priya',
    });
    expect(within(card).getByText(/· you/)).toBeTruthy();
    expect(within(card).getByText('Vegan')).toBeTruthy();
  });
  it('stays open with what was typed while the stream reconnects', async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    const { dialog } = await openDialog();
    fireEvent.change(within(dialog).getByLabelText('Dish'), { target: { value: 'Pie' } });

    act(() => FakeEventSource.latest().fail());
    act(() => vi.advanceTimersByTime(2_000));

    expect(screen.getByText(/Connection lost/)).toBeTruthy();
    expect(
      (within(screen.getByRole('dialog')).getByLabelText('Dish') as HTMLInputElement).value,
    ).toBe('Pie');
    vi.useRealTimers();
  });
});

describe('release', () => {
  afterEach(() => {
    cleanup();
    vi.unstubAllGlobals();
  });

  const mine = { ...claimedBy(open(1, 0), meId, 'Priya', 'Garlic green beans') };

  it('asks before releasing, then opens the slot', async () => {
    const reopened = open(1, 0);
    serve(snapshot([mine, open(2, 1), open(3, 2)]), () =>
      Response.json({ slot: reopened, seq: 6 }),
    );
    renderRoutes(`/events/${eventId}`);
    fireEvent.click(await screen.findByRole('button', { name: 'Release your Mains slot' }));

    const popover = screen.getByRole('dialog', { name: "Release 'Garlic green beans'?" });
    fireEvent.click(within(popover).getByRole('button', { name: 'Release' }));

    expect(await screen.findByRole('button', { name: 'Claim open Mains slot 1' })).toBeTruthy();
  });

  it('rolls back on a network error and retries from the toast', async () => {
    let calls = 0;
    serve(snapshot([mine, open(2, 1), open(3, 2)]), () => {
      calls += 1;
      if (calls === 1) throw new TypeError('Failed to fetch');
      return Response.json({ slot: open(1, 0), seq: 6 });
    });
    renderRoutes(`/events/${eventId}`);
    fireEvent.click(await screen.findByRole('button', { name: 'Release your Mains slot' }));
    fireEvent.click(screen.getByRole('button', { name: 'Release' }));

    const toast = await screen.findByRole('alert');
    expect(toast.textContent).toContain("Couldn't reach Dishpatch — try again.");
    expect(screen.getByRole('article', { name: /Garlic green beans/ })).toBeTruthy();

    fireEvent.click(within(toast).getByRole('button', { name: 'Try again' }));

    expect(await screen.findByRole('button', { name: 'Claim open Mains slot 1' })).toBeTruthy();
    expect(calls).toBe(2);
  });

  it('rolls back and explains a 403 NOT_OWNER', async () => {
    serve(snapshot([mine, open(2, 1), open(3, 2)]), () =>
      Response.json(
        { error: { code: 'NOT_OWNER', message: "That isn't your claim.", requestId: 'r' } },
        { status: 403 },
      ),
    );
    renderRoutes(`/events/${eventId}`);
    fireEvent.click(await screen.findByRole('button', { name: 'Release your Mains slot' }));
    fireEvent.click(screen.getByRole('button', { name: 'Release' }));

    expect(await screen.findByText("That isn't your claim.")).toBeTruthy();
    expect(screen.getByRole('article', { name: /Garlic green beans/ })).toBeTruthy();
  });

  it('closes the popover and tells me when the host removes my claim', async () => {
    serve(snapshot([mine, open(2, 1), open(3, 2)]), () => new Promise(() => {}));
    renderRoutes(`/events/${eventId}`);
    fireEvent.click(await screen.findByRole('button', { name: 'Release your Mains slot' }));
    expect(screen.getByRole('dialog')).toBeTruthy();

    act(() => {
      FakeEventSource.latest().open();
      FakeEventSource.latest().emit({
        type: 'slot.released',
        seq: 6,
        slotId: slotId(1),
        actorRole: 'host',
      });
    });

    expect(screen.queryByRole('dialog')).toBeNull();
    expect(screen.getByText("Mina removed your claim on 'Garlic green beans'.")).toBeTruthy();
  });

  it('toasts when someone takes the last open slot of a category', async () => {
    serve(snapshot([mine, open(2, 1), open(3, 0, 'dessert')]), () => new Promise(() => {}));
    renderRoutes(`/events/${eventId}`);
    await screen.findByRole('button', { name: 'Claim open Desserts slot 1' });

    act(() => {
      FakeEventSource.latest().open();
      FakeEventSource.latest().emit({
        type: 'slot.claimed',
        seq: 6,
        slot: claimedBy(open(3, 0, 'dessert'), jonahId, 'Jonah', 'Baklava'),
      });
    });

    expect(screen.getByRole('alert').textContent).toContain(
      'Jonah just took the last dessert slot.',
    );
  });
});
