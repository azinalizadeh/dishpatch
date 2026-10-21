import { cleanup, render, screen } from '@testing-library/react';
import { createMemoryRouter, RouterProvider } from 'react-router';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { routes } from '../src/router.tsx';

function renderAt(path: string) {
  render(<RouterProvider router={createMemoryRouter(routes, { initialEntries: [path] })} />);
}

describe('router (smoke)', () => {
  beforeEach(() => {
    // Every API call answers 404 here: INVITE_INVALID for invites, NOT_FOUND otherwise.
    vi.stubGlobal(
      'fetch',
      vi.fn(async (path: string) =>
        Response.json(
          {
            error: {
              code: path.startsWith('/api/invites/') ? 'INVITE_INVALID' : 'NOT_FOUND',
              message: 'Not found.',
              requestId: 'req-1',
            },
          },
          { status: 404 },
        ),
      ),
    );
  });
  afterEach(() => {
    cleanup();
    vi.unstubAllGlobals();
  });

  it.each([
    ['/', "Who's bringing what?"],
    // Without the in-memory links (e.g. after a reload) share falls through to the board,
    // which needs a session for that board.
    ['/events/abc/share', 'Nothing on this plate'],
    ['/e/tok', "This invite link doesn't work anymore"],
    ['/h/tok', 'Nothing on this plate'],
    ['/events/abc', 'Nothing on this plate'],
    ['/events/abc/coverage', 'Dietary coverage'],
    ['/events/abc/host', 'Host settings'],
    ['/no/such/page', 'Nothing on this plate'],
  ])('%s renders the %s heading', async (path, heading) => {
    renderAt(path);
    expect(await screen.findByRole('heading', { level: 1, name: heading })).toBeTruthy();
  });
});
