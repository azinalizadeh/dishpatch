import { Snapshot } from '@dishpatch/shared';
import { useCallback, useEffect, useState } from 'react';
import { useParams } from 'react-router';
import { ApiRequestError, getJson } from '../api/client.ts';
import { Banner } from '../components/Banner.tsx';
import { Button } from '../components/Button.tsx';
import { formatWhen } from '../format.ts';
import { NotFoundScreen } from './NotFoundScreen.tsx';

type Load =
  | { kind: 'loading' }
  | { kind: 'ready'; snapshot: Snapshot }
  | { kind: 'not-found' }
  | { kind: 'failed' };

/**
 * A static board until M4 (F3.6) builds the live layout: it loads the snapshot once and lists
 * who's coming. No session for this board → the not-found screen (02-user-flows.md › Flow C).
 */
export function BoardScreen() {
  const { eventId = '' } = useParams();
  const [load, setLoad] = useState<Load>({ kind: 'loading' });

  const fetchSnapshot = useCallback(async () => {
    setLoad({ kind: 'loading' });
    try {
      const snapshot = await getJson(`/api/events/${encodeURIComponent(eventId)}`, Snapshot);
      setLoad({ kind: 'ready', snapshot });
    } catch (err) {
      setLoad(
        err instanceof ApiRequestError && err.status === 404
          ? { kind: 'not-found' }
          : { kind: 'failed' },
      );
    }
  }, [eventId]);

  useEffect(() => {
    void fetchSnapshot();
  }, [fetchSnapshot]);

  if (load.kind === 'not-found') return <NotFoundScreen />;
  if (load.kind === 'loading') {
    return (
      <p role="status" className="p-s6 text-center text-muted">
        Loading the board…
      </p>
    );
  }
  if (load.kind === 'failed') {
    return (
      <div className="mx-auto my-s7 max-w-[640px] px-s4">
        <Banner
          tone="error"
          icon="!"
          role="alert"
          action={
            <Button variant="ghost" size="sm" onClick={() => void fetchSnapshot()}>
              Try again
            </Button>
          }
        >
          Something broke on our side. Please try again.
        </Banner>
      </div>
    );
  }

  const { event, participants, me } = load.snapshot;
  return (
    <section aria-labelledby="board-h" className="mx-auto max-w-[1200px] p-s4 tablet:p-s6">
      <h1 id="board-h" className="text-[32px] leading-[1.15] tablet:text-[40px]">
        {event.title}
      </h1>
      <p className="mt-s2 flex flex-wrap gap-x-s4 text-sm/[1.5] font-semibold text-muted">
        <span>
          <span aria-hidden="true">📅 </span>
          {formatWhen(event.startsAt, { withYear: false })}
        </span>
        {event.location ? (
          <span>
            <span aria-hidden="true">📍 </span>
            {event.location}
          </span>
        ) : null}
      </p>
      <div className="mt-s5 max-w-[340px] rounded-lg border border-border bg-surface p-s4 shadow-e1">
        <h2 className="text-lg leading-[1.3]">Who's coming</h2>
        <ul className="mt-s2 flex flex-col gap-s1">
          {participants.map((p) => (
            <li key={p.id}>
              {p.displayName}
              {p.role === 'host' ? <span className="text-muted"> · host</span> : null}
              {p.id === me.participantId ? <span className="text-muted"> (you)</span> : null}
            </li>
          ))}
        </ul>
      </div>
    </section>
  );
}
