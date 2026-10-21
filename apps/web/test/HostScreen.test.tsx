import { computeCoverage, type Snapshot } from '@dishpatch/shared';
import { cleanup, fireEvent, screen, waitFor, within } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { mockupBoard } from '../../../packages/shared/test/fixtures/mockup-board.ts';
import { renderRoutes } from './render-routes.tsx';

const eventId = '0b5a4c1e-8a57-4d4b-9f4c-2f1b8e7a9c11';
const TITLE = "Friendsgiving at Mina's";

function snapshot(role: 'host' | 'guest' = 'host'): Snapshot {
  const { participants, slots } = mockupBoard();
  const me = participants.find((p) => p.role === role) ?? participants[0];
  return {
    event: {
      id: eventId,
      title: TITLE,
      startsAt: '2026-11-21T17:00:00.000Z',
      location: null,
      locked: false,
    },
    slots,
    participants,
    coverage: computeCoverage(participants, slots),
    me: { participantId: me?.id ?? '', role },
    seq: 9,
  };
}

type Handler = (url: string, init: RequestInit | undefined) => Response | Promise<Response>;

/** Answers GET snapshot with `board`; every other request goes to `handler`. */
function serve(board: Snapshot, handler: Handler = () => Response.json({}, { status: 500 })) {
  const fetchMock = vi.fn(async (url: string, init?: RequestInit) =>
    (init?.method ?? 'GET') === 'GET' ? Response.json(board) : handler(url, init),
  );
  vi.stubGlobal('fetch', fetchMock);
  return fetchMock;
}

const apiError = (status: number, code: string, message: string) =>
  Response.json({ error: { code, message, requestId: 'req-1' } }, { status });

describe('HostScreen', () => {
  afterEach(() => {
    cleanup();
    vi.unstubAllGlobals();
  });

  it('delete button stays disabled until the typed name matches exactly', async () => {
    const fetchMock = serve(snapshot(), () => new Response(null, { status: 204 }));
    const router = renderRoutes(`/events/${eventId}/host`);
    fireEvent.click(await screen.findByRole('button', { name: 'Delete board' }));

    const dialog = screen.getByRole('alertdialog', { name: `Delete “${TITLE}”?` });
    expect(within(dialog).getByText(/6 guests and 6 claims will be removed/)).toBeTruthy();
    const field = within(dialog).getByLabelText('Event name');
    expect(document.activeElement).toBe(field);
    const confirm = within(dialog).getByRole('button', { name: 'Delete for everyone' });
    expect((confirm as HTMLButtonElement).disabled).toBe(true);

    for (const near of ["friendsgiving at mina's", `${TITLE} `, 'Friendsgiving at Mina']) {
      fireEvent.change(field, { target: { value: near } });
      expect((confirm as HTMLButtonElement).disabled).toBe(true);
    }
    fireEvent.change(field, { target: { value: TITLE } });
    expect((confirm as HTMLButtonElement).disabled).toBe(false);
    fireEvent.click(confirm);

    await waitFor(() => expect(router.state.location.pathname).toBe('/'));
    const [, init] = fetchMock.mock.calls.find(([, i]) => i?.method === 'DELETE') ?? [];
    expect(JSON.parse(String(init?.body))).toEqual({ confirmTitle: TITLE });
    expect(await screen.findByText('Board deleted')).toBeTruthy();
  });

  it('the delete dialog ignores Esc and the scrim; Keep board closes it', async () => {
    serve(snapshot());
    renderRoutes(`/events/${eventId}/host`);
    fireEvent.click(await screen.findByRole('button', { name: 'Delete board' }));
    const dialog = screen.getByRole('alertdialog');
    fireEvent.keyDown(document, { key: 'Escape' });
    fireEvent.click(dialog.parentElement as HTMLElement);
    expect(screen.getByRole('alertdialog')).toBeTruthy();
    fireEvent.click(within(dialog).getByRole('button', { name: 'Keep board' }));
    expect(screen.queryByRole('alertdialog')).toBeNull();
  });

  it('switch reverts and shows a toast when PATCH fails', async () => {
    let fail: (res: Response) => void = () => {};
    serve(snapshot(), () => new Promise<Response>((resolve) => (fail = resolve)));
    renderRoutes(`/events/${eventId}/host`);
    const toggle = await screen.findByRole('switch', { name: 'Lock the board' });
    expect(toggle.getAttribute('aria-checked')).toBe('false');

    fireEvent.click(toggle);
    // Optimistic: on at once, disabled while saving.
    await waitFor(() => expect(toggle.getAttribute('aria-checked')).toBe('true'));
    expect((toggle as HTMLButtonElement).disabled).toBe(true);
    fail(Response.json({}, { status: 500 }));

    expect(await screen.findByText("Couldn't save — try again")).toBeTruthy();
    expect(screen.getByRole('switch').getAttribute('aria-checked')).toBe('false');
  });

  it('locking succeeds with a toast', async () => {
    const fetchMock = serve(snapshot(), () =>
      Response.json({
        event: { ...snapshot().event, locked: true },
        seq: 10,
      }),
    );
    renderRoutes(`/events/${eventId}/host`);
    fireEvent.click(await screen.findByRole('switch', { name: 'Lock the board' }));
    expect(await screen.findByText('Board locked')).toBeTruthy();
    expect(screen.getByRole('switch').getAttribute('aria-checked')).toBe('true');
    const [url, init] = fetchMock.mock.calls.find(([, i]) => i?.method === 'PATCH') ?? [];
    expect(url).toBe(`/api/events/${eventId}`);
    expect(JSON.parse(String(init?.body))).toEqual({ locked: true });
  });

  it('a new link shows the invite inline', async () => {
    const inviteUrl = `http://localhost:5173/e/${'n'.repeat(43)}`;
    serve(snapshot(), () => Response.json({ inviteUrl, seq: 10 }));
    renderRoutes(`/events/${eventId}/host`);
    fireEvent.click(await screen.findByRole('button', { name: 'New link' }));
    expect(await screen.findByText('New invite link ready')).toBeTruthy();
    expect(screen.getByRole('group', { name: 'New invite link' }).textContent).toContain(
      'localhost:5173/e/nnnnnnnn…nnnn',
    );
  });

  it("can't remove a claimed slot: − stops at the claimed count", async () => {
    serve(snapshot());
    renderRoutes(`/events/${eventId}/host`);
    const salads = await screen.findByRole('button', { name: 'Remove an empty salad slot' });
    // 2 salads, 1 claimed: one open one can go.
    expect((salads as HTMLButtonElement).disabled).toBe(false);
    const drinks = screen.getByRole('button', { name: 'Remove an empty drink slot' });
    expect((drinks as HTMLButtonElement).disabled).toBe(false);
    // Mains and sides each have two claims.
    expect(screen.getAllByText('· 2 claimed')).toHaveLength(2);
  });

  it('removing the last open slot of a category leaves the claimed ones', async () => {
    const board = snapshot();
    const fetchMock = serve(board, () => Response.json({ seq: 10 }));
    renderRoutes(`/events/${eventId}/host`);
    fireEvent.click(await screen.findByRole('button', { name: 'Remove an empty main slot' }));
    await waitFor(() =>
      expect(screen.getByRole('spinbutton', { name: 'Mains' }).getAttribute('aria-valuenow')).toBe(
        '2',
      ),
    );
    const openMain = board.slots.find((s) => s.category === 'main' && !s.claimedBy);
    const [url] = fetchMock.mock.calls.find(([, i]) => i?.method === 'DELETE') ?? [];
    expect(url).toBe(`/api/events/${eventId}/slots/${openMain?.id}`);
    expect(
      (screen.getByRole('button', { name: 'Remove an empty main slot' }) as HTMLButtonElement)
        .disabled,
    ).toBe(true);
  });

  it('says inline to remove the claim first when a slot was claimed meanwhile', async () => {
    serve(snapshot(), () =>
      apiError(409, 'SLOT_CLAIMED', 'Remove the claim first, then remove the slot.'),
    );
    renderRoutes(`/events/${eventId}/host`);
    fireEvent.click(await screen.findByRole('button', { name: 'Remove an empty side slot' }));
    const inline = await screen.findByRole('alert');
    expect(inline.textContent).toBe('Remove the claim first — someone just claimed that slot.');
  });

  it('a guest who opens host settings gets notfound', async () => {
    serve(snapshot('guest'));
    renderRoutes(`/events/${eventId}/host`);
    expect(await screen.findByRole('heading', { name: 'Nothing on this plate' })).toBeTruthy();
    expect(screen.queryByRole('switch')).toBeNull();
  });
});

describe('BoardScreen host entry point', () => {
  afterEach(() => {
    cleanup();
    vi.unstubAllGlobals();
  });

  it('Host settings button is not rendered for guests', async () => {
    serve(snapshot('guest'));
    renderRoutes(`/events/${eventId}`);
    await screen.findByRole('heading', { name: TITLE });
    expect(screen.queryByRole('link', { name: 'Host settings' })).toBeNull();
  });

  it('Host settings button is rendered for the host', async () => {
    serve(snapshot('host'));
    renderRoutes(`/events/${eventId}`);
    expect(await screen.findByRole('link', { name: 'Host settings' })).toBeTruthy();
  });
});
