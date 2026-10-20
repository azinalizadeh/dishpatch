import { HostLinkResponse } from '@dishpatch/shared';
import { useCallback, useEffect, useRef, useState } from 'react';
import { useNavigate, useParams } from 'react-router';
import { ApiRequestError, NetworkError, postJson } from '../api/client.ts';
import { Banner } from '../components/Banner.tsx';
import { Button } from '../components/Button.tsx';
import { NotFoundScreen } from './NotFoundScreen.tsx';

type State = 'opening' | 'not-found' | 'rate-limited' | 'offline' | 'failed';

/**
 * `/h/:hostToken` has no screen of its own: it trades the token for a host session, then replaces
 * the history entry so the token leaves the address bar (02-user-flows.md › Flow G).
 */
export function HostLinkScreen() {
  const { hostToken = '' } = useParams();
  const navigate = useNavigate();
  const [state, setState] = useState<State>('opening');
  const started = useRef(false);

  const exchange = useCallback(() => {
    setState('opening');
    postJson(`/api/host-links/${encodeURIComponent(hostToken)}/session`, HostLinkResponse)
      .then(({ eventId }) => navigate(`/events/${eventId}`, { replace: true }))
      .catch((err: unknown) => {
        if (err instanceof NetworkError) setState('offline');
        else if (err instanceof ApiRequestError && err.code === 'NOT_FOUND') setState('not-found');
        else if (err instanceof ApiRequestError && err.code === 'RATE_LIMITED') {
          setState('rate-limited');
        } else setState('failed');
      });
  }, [hostToken, navigate]);

  useEffect(() => {
    // One exchange per mount, also under StrictMode's double effect run.
    if (started.current) return;
    started.current = true;
    exchange();
  }, [exchange]);

  if (state === 'not-found') return <NotFoundScreen />;
  if (state === 'rate-limited') {
    return <NotFoundScreen note="Too many attempts. Try again in a minute." />;
  }
  if (state === 'offline' || state === 'failed') {
    return (
      <div className="mx-auto my-s7 max-w-[640px] px-s4">
        <Banner
          tone="error"
          icon="!"
          role="alert"
          action={
            <Button variant="ghost" size="sm" onClick={exchange}>
              Try again
            </Button>
          }
        >
          {state === 'offline'
            ? "You're offline, so we couldn't open your board."
            : 'Something broke on our side. Please try again.'}
        </Banner>
      </div>
    );
  }
  return (
    <p role="status" className="p-s6 text-center text-muted">
      Opening your board…
    </p>
  );
}
