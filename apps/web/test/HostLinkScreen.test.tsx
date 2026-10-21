import { cleanup, render, screen, waitFor } from '@testing-library/react';
import { createMemoryRouter, RouterProvider } from 'react-router';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { routes } from '../src/router.tsx';

const eventId = '0b5a4c1e-8a57-4d4b-9f4c-2f1b8e7a9c11';

function renderAt(path: string) {
  const router = createMemoryRouter(routes, { initialEntries: [path] });
  render(<RouterProvider router={router} />);
  return router;
}

describe('HostLinkScreen', () => {
  afterEach(() => {
    cleanup();
    vi.unstubAllGlobals();
  });

  it('exchanges the token once and replaces the URL with the board', async () => {
    const fetchMock = vi.fn(async (_path: string) => Response.json({ eventId }));
    vi.stubGlobal('fetch', fetchMock);
    const router = renderAt(`/h/${'t'.repeat(43)}`);

    await waitFor(() => expect(router.state.location.pathname).toBe(`/events/${eventId}`));
    expect(router.state.historyAction).toBe('REPLACE');
    // One exchange; the board then loads its own snapshot.
    expect(
      fetchMock.mock.calls.filter(([path]) => String(path).includes('/host-links/')),
    ).toHaveLength(1);
  });

  it('shows a retryable error, not the not-found screen, when the server fails', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () =>
        Response.json(
          { error: { code: 'INTERNAL', message: 'Oops.', requestId: 'req-1' } },
          { status: 500 },
        ),
      ),
    );
    renderAt(`/h/${'t'.repeat(43)}`);

    expect((await screen.findByRole('alert')).textContent).toContain('Something broke');
    expect(screen.getByRole('button', { name: 'Try again' })).toBeTruthy();
    expect(screen.queryByText('Nothing on this plate')).toBeNull();
  });
});
