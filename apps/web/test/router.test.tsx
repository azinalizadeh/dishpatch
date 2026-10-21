import { cleanup, render, screen } from '@testing-library/react';
import { createMemoryRouter, RouterProvider } from 'react-router';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { routes } from '../src/router.tsx';

function renderAt(path: string) {
  render(<RouterProvider router={createMemoryRouter(routes, { initialEntries: [path] })} />);
}

describe('router (smoke)', () => {
  beforeEach(() => {
    // Any API call (the host-link exchange) answers 404 here.
    vi.stubGlobal(
      'fetch',
      vi.fn(async () =>
        Response.json(
          { error: { code: 'NOT_FOUND', message: 'Not found.', requestId: 'req-1' } },
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
    // Without the in-memory links (e.g. after a reload) share falls through to the board.
    ['/events/abc/share', 'Live board'],
    ['/e/tok', 'Join board'],
    ['/h/tok', 'Nothing on this plate'],
    ['/events/abc', 'Live board'],
    ['/events/abc/coverage', 'Dietary coverage'],
    ['/events/abc/host', 'Host settings'],
    ['/no/such/page', 'Nothing on this plate'],
  ])('%s renders the %s heading', async (path, heading) => {
    renderAt(path);
    expect(await screen.findByRole('heading', { level: 1, name: heading })).toBeTruthy();
  });
});
