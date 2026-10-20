import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { createMemoryRouter, RouterProvider } from 'react-router';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createdBoard, forgetCreatedBoard } from '../src/api/created-board.ts';
import { routes } from '../src/router.tsx';

const fetchMock = vi.fn<typeof fetch>();

function renderCreate() {
  const router = createMemoryRouter(routes, { initialEntries: ['/'] });
  render(<RouterProvider router={router} />);
  return router;
}

function fill(label: string | RegExp, value: string) {
  fireEvent.change(screen.getByLabelText(label), { target: { value } });
}

function fillValidForm() {
  fill('Event name', "Friendsgiving at Mina's");
  fill('Date & time', '2099-11-21T18:00');
  fill(/Where/, "Mina's flat, 3rd floor");
  fill('Your name', 'Mina');
}

function submit() {
  fireEvent.click(screen.getByRole('button', { name: 'Create board' }));
}

describe('CreateScreen', () => {
  beforeEach(() => {
    fetchMock.mockReset();
    vi.stubGlobal('fetch', fetchMock);
    forgetCreatedBoard();
  });
  afterEach(() => {
    cleanup();
    vi.unstubAllGlobals();
  });

  it('shows field errors and focuses the summary banner on invalid submit', async () => {
    renderCreate();
    fill('Event name', "Friendsgiving at Mina's");
    fill('Date & time', '2020-11-01T18:00');
    submit();

    const banner = await screen.findByRole('alert');
    expect(banner.textContent).toContain('Fix 2 fields to create your board.');
    expect(document.activeElement).toBe(banner);
    expect(screen.getByText('Pick a date in the future.')).toBeTruthy();
    expect(screen.getByText("Add a name so guests know who's hosting.")).toBeTruthy();
    const name = screen.getByLabelText('Your name');
    expect(name.getAttribute('aria-invalid')).toBe('true');
    expect(name.getAttribute('aria-describedby')).toBe('c-host-err');
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('shows rate-limit banner on 429', async () => {
    fetchMock.mockResolvedValue(
      Response.json(
        {
          error: {
            code: 'RATE_LIMITED',
            message: "You've made a lot of boards — try again in a bit.",
            requestId: 'req-1',
            retryAfterSeconds: 1790,
          },
        },
        { status: 429 },
      ),
    );
    renderCreate();
    fillValidForm();
    submit();

    const banner = await screen.findByRole('alert');
    expect(banner.textContent).toContain("You've made a lot of boards — try again in 30 minutes.");
    expect(createdBoard(undefined)).toBeNull();
  });

  it('sends the shared payload and goes to the share screen on success', async () => {
    const eventId = '0b5a4c1e-8a57-4d4b-9f4c-2f1b8e7a9c11';
    fetchMock.mockResolvedValue(
      Response.json(
        {
          eventId,
          inviteUrl: `http://localhost:5173/e/${'i'.repeat(43)}`,
          hostUrl: `http://localhost:5173/h/${'h'.repeat(43)}`,
        },
        { status: 201 },
      ),
    );
    const router = renderCreate();
    fillValidForm();
    fireEvent.click(screen.getByRole('button', { name: 'More mains' }));
    submit();

    await waitFor(() => expect(router.state.location.pathname).toBe(`/events/${eventId}/share`));
    const [url, init] = fetchMock.mock.calls[0] ?? [];
    expect(url).toBe('/api/events');
    const body = JSON.parse(String(init?.body));
    expect(body).toMatchObject({
      title: "Friendsgiving at Mina's",
      location: "Mina's flat, 3rd floor",
      hostName: 'Mina',
      hostDietaryNeeds: [],
    });
    expect(Date.parse(body.startsAt)).toBe(new Date('2099-11-21T18:00').getTime());
    expect(body.slots).toEqual([
      { category: 'main', count: 4 },
      { category: 'side', count: 3 },
      { category: 'salad', count: 2 },
      { category: 'dessert', count: 2 },
      { category: 'drinks', count: 2 },
    ]);
    expect(createdBoard(eventId)?.slotCount).toBe(13);
  });

  it('shows the offline banner when the request never leaves, and retries', async () => {
    fetchMock.mockRejectedValueOnce(new TypeError('Failed to fetch'));
    renderCreate();
    fillValidForm();
    submit();

    const banner = await screen.findByRole('alert');
    expect(banner.textContent).toContain("You're offline, nothing was created.");
    fetchMock.mockRejectedValueOnce(new TypeError('Failed to fetch'));
    fireEvent.click(screen.getByRole('button', { name: 'Try again' }));
    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(2));
  });

  it('shows the request id on a server error', async () => {
    fetchMock.mockResolvedValue(
      Response.json(
        { error: { code: 'INTERNAL', message: 'Something went wrong.', requestId: 'req-7f3a' } },
        { status: 500 },
      ),
    );
    renderCreate();
    fillValidForm();
    submit();
    const banner = await screen.findByRole('alert');
    expect(banner.textContent).toContain('Something broke on our side.');
    expect(banner.textContent).toContain('req-7f3a');
  });

  it('steppers stop at 0 and answer arrow keys', () => {
    renderCreate();
    const drinks = screen.getByRole('spinbutton', { name: 'Drinks' });
    fireEvent.keyDown(drinks, { key: 'ArrowUp' });
    expect(drinks.getAttribute('aria-valuenow')).toBe('3');
    for (let i = 0; i < 4; i++) fireEvent.keyDown(drinks, { key: 'ArrowDown' });
    expect(drinks.getAttribute('aria-valuenow')).toBe('0');
    expect(screen.getByRole('button', { name: 'Fewer drinks' })).toHaveProperty('disabled', true);
  });
});
