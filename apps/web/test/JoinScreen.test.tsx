import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { createMemoryRouter, RouterProvider } from 'react-router';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { rememberJoin } from '../src/api/joined-boards.ts';
import { routes } from '../src/router.tsx';

const token = 'i'.repeat(43);
const eventId = '0b5a4c1e-8a57-4d4b-9f4c-2f1b8e7a9c11';
const participantId = '5d1f8a3e-2c4b-4e6f-8a9b-1c2d3e4f5a6b';

const preview = {
  title: "Friendsgiving at Mina's",
  startsAt: '2026-11-21T17:00:00.000Z',
  location: "Mina's flat, 3rd floor",
  hostName: 'Mina',
  participantCount: 6,
};

const snapshot = {
  event: {
    id: eventId,
    title: preview.title,
    startsAt: preview.startsAt,
    location: null,
    locked: false,
  },
  slots: [],
  participants: [{ id: participantId, displayName: 'Priya', dietaryNeeds: [], role: 'guest' }],
  me: { participantId, role: 'guest' },
  seq: 1,
};

const apiError = (status: number, code: string, message = 'Nope.') =>
  Response.json({ error: { code, message, requestId: 'req-1' } }, { status });

type Handler = (path: string, init?: RequestInit) => Response | Promise<Response>;

function stubApi(handler: Handler) {
  const fetchMock = vi.fn(async (path: string, init?: RequestInit) => handler(path, init));
  vi.stubGlobal('fetch', fetchMock);
  return fetchMock;
}

function renderJoin() {
  const router = createMemoryRouter(routes, { initialEntries: [`/e/${token}`] });
  render(<RouterProvider router={router} />);
  return router;
}

describe('JoinScreen', () => {
  beforeEach(() => localStorage.clear());
  afterEach(() => {
    cleanup();
    vi.unstubAllGlobals();
  });

  it('shows the preview and the optional, board-only dietary note', async () => {
    stubApi(() => Response.json(preview));
    renderJoin();

    expect(await screen.findByRole('heading', { level: 1, name: preview.title })).toBeTruthy();
    expect(screen.getByText('Mina invited you to')).toBeTruthy();
    expect(screen.getByText('6 going')).toBeTruthy();
    expect(screen.getByText('(optional)')).toBeTruthy();
    expect(
      screen.getByText("Only the board sees this, and it's deleted with the board."),
    ).toBeTruthy();
  });

  it('toggling a chip sets aria-pressed', async () => {
    stubApi(() => Response.json(preview));
    renderJoin();

    const vegan = await screen.findByRole('button', { name: 'Vegan' });
    expect(vegan.getAttribute('aria-pressed')).toBe('false');
    fireEvent.click(vegan);
    expect(screen.getByRole('button', { name: /Vegan/ }).getAttribute('aria-pressed')).toBe('true');
    fireEvent.click(screen.getByRole('button', { name: /Vegan/ }));
    expect(screen.getByRole('button', { name: 'Vegan' }).getAttribute('aria-pressed')).toBe(
      'false',
    );
  });

  it('shows inline error on 409 NAME_TAKEN and keeps the form', async () => {
    stubApi((path) =>
      path.endsWith('/join')
        ? apiError(409, 'NAME_TAKEN', 'Someone called Sam is already here — add an initial?')
        : Response.json(preview),
    );
    renderJoin();

    fireEvent.change(await screen.findByLabelText('Your name'), { target: { value: 'sam' } });
    fireEvent.click(screen.getByRole('button', { name: 'Vegan' }));
    fireEvent.click(screen.getByRole('button', { name: 'Join the board' }));

    expect(
      await screen.findByText('Someone called Sam is already here — add an initial?'),
    ).toBeTruthy();
    const name = screen.getByLabelText('Your name') as HTMLInputElement;
    expect(name.value).toBe('sam');
    expect(name.getAttribute('aria-invalid')).toBe('true');
    expect(screen.getByRole('button', { name: /Vegan/ }).getAttribute('aria-pressed')).toBe('true');
  });

  it('renders the error card for 404', async () => {
    stubApi(() => apiError(404, 'INVITE_INVALID'));
    renderJoin();

    const card = await screen.findByRole('alert');
    expect(card.textContent).toContain("This invite link doesn't work anymore");
    expect(screen.getByRole('link', { name: 'Start your own board' }).getAttribute('href')).toBe(
      '/',
    );
    await waitFor(() => expect(document.activeElement).toBe(card));
  });

  it('joins, sends trimmed input and replaces the URL with the board', async () => {
    const fetchMock = stubApi((path) => {
      if (path.endsWith('/join')) return Response.json({ eventId, participantId }, { status: 201 });
      if (path.startsWith('/api/events/')) return Response.json(snapshot);
      return Response.json(preview);
    });
    const router = renderJoin();

    fireEvent.change(await screen.findByLabelText('Your name'), { target: { value: ' Priya ' } });
    fireEvent.click(screen.getByRole('button', { name: 'Halal' }));
    fireEvent.click(screen.getByRole('button', { name: 'Join the board' }));

    await waitFor(() => expect(router.state.location.pathname).toBe(`/events/${eventId}`));
    expect(router.state.historyAction).toBe('REPLACE');
    const join = fetchMock.mock.calls.find(([path]) => path.endsWith('/join'));
    expect(JSON.parse(String(join?.[1]?.body))).toEqual({
      displayName: 'Priya',
      dietaryNeeds: ['halal'],
    });
    // Nothing in storage holds the raw invite token.
    expect(JSON.stringify(localStorage)).not.toContain(token);
  });

  it('a browser that already joined goes straight to the board', async () => {
    await rememberJoin(token, eventId);
    const fetchMock = stubApi((path) =>
      path.startsWith('/api/events/') ? Response.json(snapshot) : Response.json(preview),
    );
    const router = renderJoin();

    await waitFor(() => expect(router.state.location.pathname).toBe(`/events/${eventId}`));
    expect(fetchMock.mock.calls.some(([path]) => path.startsWith('/api/invites/'))).toBe(false);
  });

  it('shows the board-full banner and a retryable offline banner', async () => {
    let joinAnswer: () => Response | Promise<Response> = () => apiError(409, 'EVENT_FULL');
    stubApi((path) => (path.endsWith('/join') ? joinAnswer() : Response.json(preview)));
    renderJoin();

    fireEvent.change(await screen.findByLabelText('Your name'), { target: { value: 'Priya' } });
    fireEvent.click(screen.getByRole('button', { name: 'Join the board' }));
    expect((await screen.findByRole('alert')).textContent).toContain('This board is full');

    joinAnswer = () => Promise.reject(new TypeError('Failed to fetch'));
    fireEvent.click(screen.getByRole('button', { name: 'Join the board' }));
    await waitFor(() => expect(screen.getByRole('alert').textContent).toContain("You're offline"));
    expect(screen.getByRole('button', { name: 'Try again' })).toBeTruthy();
  });

  it('rejects a name of only spaces without calling the API', async () => {
    const fetchMock = stubApi(() => Response.json(preview));
    renderJoin();

    fireEvent.change(await screen.findByLabelText('Your name'), { target: { value: '   ' } });
    fireEvent.click(screen.getByRole('button', { name: 'Join the board' }));

    expect(await screen.findByText('Add a name so people know who you are.')).toBeTruthy();
    expect(fetchMock.mock.calls.some(([path]) => path.endsWith('/join'))).toBe(false);
  });

  it('a remembered board still opens when the session check hits a server blip', async () => {
    await rememberJoin(token, eventId);
    const fetchMock = stubApi((path) =>
      path.startsWith('/api/events/') ? apiError(500, 'INTERNAL') : Response.json(preview),
    );
    const router = renderJoin();

    await waitFor(() => expect(router.state.location.pathname).toBe(`/events/${eventId}`));
    expect(fetchMock.mock.calls.some(([path]) => path.startsWith('/api/invites/'))).toBe(false);
  });

  it('a validation error that is not about the name shows a banner, not a name error', async () => {
    stubApi((path) =>
      path.endsWith('/join')
        ? Response.json(
            {
              error: {
                code: 'VALIDATION',
                message: 'Some fields need fixing.',
                requestId: 'req-1',
                fields: { 'dietaryNeeds.0': 'Invalid option' },
              },
            },
            { status: 400 },
          )
        : Response.json(preview),
    );
    renderJoin();

    fireEvent.change(await screen.findByLabelText('Your name'), { target: { value: 'Priya' } });
    fireEvent.click(screen.getByRole('button', { name: 'Join the board' }));

    expect((await screen.findByRole('alert')).textContent).toContain('Something broke');
    expect(screen.getByLabelText('Your name').getAttribute('aria-invalid')).toBeNull();
  });
});
