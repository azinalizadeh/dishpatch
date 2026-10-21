import { createBrowserRouter, type RouteObject } from 'react-router';
import { AppShell } from './components/AppShell.tsx';
import { BoardScreen } from './screens/BoardScreen.tsx';
import { CoverageScreen } from './screens/CoverageScreen.tsx';
import { CreateScreen } from './screens/CreateScreen.tsx';
import { HostLinkScreen } from './screens/HostLinkScreen.tsx';
import { HostScreen } from './screens/HostScreen.tsx';
import { JoinScreen } from './screens/JoinScreen.tsx';
import { NotFoundScreen } from './screens/NotFoundScreen.tsx';
import { ShareScreen } from './screens/ShareScreen.tsx';

/** The 8 SPA routes from 02-user-flows.md › Screen inventory (the claim dialog is ?claim= on the board). */
export const routes: RouteObject[] = [
  {
    element: <AppShell />,
    children: [
      { path: '/', element: <CreateScreen /> },
      { path: '/events/:eventId/share', element: <ShareScreen /> },
      { path: '/e/:inviteToken', element: <JoinScreen /> },
      { path: '/h/:hostToken', element: <HostLinkScreen /> },
      { path: '/events/:eventId', element: <BoardScreen /> },
      { path: '/events/:eventId/coverage', element: <CoverageScreen /> },
      { path: '/events/:eventId/host', element: <HostScreen /> },
      { path: '*', element: <NotFoundScreen /> },
    ],
  },
];

export function createAppRouter() {
  return createBrowserRouter(routes);
}
