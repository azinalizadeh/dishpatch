import type { HostLinkResponse } from '@dishpatch/shared';
import { useEffect, useRef, useState } from 'react';
import { useNavigate, useParams } from 'react-router';
import { ApiRequestError, postJson } from '../api/client.ts';
import { NotFoundScreen } from './NotFoundScreen.tsx';

type State = 'opening' | 'not-found' | 'rate-limited';

/**
 * `/h/:hostToken` has no screen of its own: it trades the token for a host session, then replaces
 * the history entry so the token leaves the address bar (02-user-flows.md › Flow G).
 */
export function HostLinkScreen() {
  const { hostToken = '' } = useParams();
  const navigate = useNavigate();
  const [state, setState] = useState<State>('opening');
  const started = useRef(false);

  useEffect(() => {
    // One exchange per mount, also under StrictMode's double effect run.
    if (started.current) return;
    started.current = true;
    postJson<HostLinkResponse>(`/api/host-links/${encodeURIComponent(hostToken)}/session`)
      .then(({ eventId }) => navigate(`/events/${eventId}`, { replace: true }))
      .catch((err: unknown) => {
        const limited = err instanceof ApiRequestError && err.code === 'RATE_LIMITED';
        setState(limited ? 'rate-limited' : 'not-found');
      });
  }, [hostToken, navigate]);

  if (state === 'not-found') return <NotFoundScreen />;
  if (state === 'rate-limited') {
    return <NotFoundScreen note="Too many attempts. Try again in a minute." />;
  }
  return (
    <p role="status" className="p-s6 text-center text-muted">
      Opening your board…
    </p>
  );
}
