import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render } from '@testing-library/react';
import { createMemoryRouter, RouterProvider } from 'react-router';
import { routes } from '../src/router.tsx';
import { installFakeEventSource } from './fake-event-source.ts';

/**
 * The app's routes at `path`, wrapped like main.tsx (a fresh QueryClient, no retries) and with
 * the fake EventSource installed, since the board opens a stream.
 */
export function renderRoutes(path: string) {
  installFakeEventSource();
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  const router = createMemoryRouter(routes, { initialEntries: [path] });
  render(
    <QueryClientProvider client={client}>
      <RouterProvider router={router} />
    </QueryClientProvider>,
  );
  return router;
}
