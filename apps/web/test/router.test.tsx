import { render, screen } from '@testing-library/react';
import { createMemoryRouter, RouterProvider } from 'react-router';
import { describe, expect, it } from 'vitest';
import { routes } from '../src/router.tsx';

function renderAt(path: string) {
  render(<RouterProvider router={createMemoryRouter(routes, { initialEntries: [path] })} />);
}

describe('router (smoke)', () => {
  it.each([
    ['/', 'Create board'],
    ['/events/abc/share', 'Share links'],
    ['/e/tok', 'Join board'],
    ['/h/tok', 'Opening your board'],
    ['/events/abc', 'Live board'],
    ['/events/abc/coverage', 'Dietary coverage'],
    ['/events/abc/host', 'Host settings'],
    ['/no/such/page', 'Nothing on this plate'],
  ])('%s renders the %s placeholder', async (path, heading) => {
    renderAt(path);
    expect(await screen.findByRole('heading', { level: 1, name: heading })).toBeTruthy();
  });
});
