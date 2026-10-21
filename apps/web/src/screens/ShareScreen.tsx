import { useCallback, useEffect, useState } from 'react';
import { Navigate, useParams } from 'react-router';
import { createdBoard } from '../api/created-board.ts';
import { Banner } from '../components/Banner.tsx';
import { ButtonLink } from '../components/Button.tsx';
import { LinkBox } from '../components/LinkBox.tsx';
import { Toast } from '../components/Toast.tsx';
import { formatWhen } from '../format.ts';

export function ShareScreen() {
  const { eventId } = useParams();
  const board = createdBoard(eventId);
  const [toast, setToast] = useState<string | null>(null);
  const [hostCopied, setHostCopied] = useState(false);
  const dismiss = useCallback(() => setToast(null), []);

  // The host link exists only in memory here: warn before the tab closes if it wasn't copied.
  useEffect(() => {
    if (!board || hostCopied) return;
    const warn = (event: BeforeUnloadEvent) => {
      event.preventDefault();
      // Older Firefox/Safari only show the confirm when returnValue is set.
      event.returnValue = '';
    };
    window.addEventListener('beforeunload', warn);
    return () => window.removeEventListener('beforeunload', warn);
  }, [board, hostCopied]);

  // After a reload the links are gone by design; the host is still signed in, so go to the board.
  if (!board) return <Navigate to={eventId ? `/events/${eventId}` : '/'} replace />;

  const copyFailed = () => setToast('Press Ctrl/⌘+C to copy');

  return (
    <section aria-labelledby="share-h" className="mx-auto my-s5 max-w-[640px] px-s4 tablet:my-s7">
      <div className="flex flex-col gap-s5 rounded-lg border border-border bg-surface p-s6 shadow-e1">
        <div>
          <p className="text-xs/[1.5] font-bold uppercase tracking-[0.02em] text-muted">
            Board created
          </p>
          <h1 id="share-h" className="mt-s1 text-[32px] leading-[1.1]">
            {board.title}
          </h1>
          <p className="mt-s1 text-muted">
            {formatWhen(board.startsAt)} · {board.slotCount}{' '}
            {board.slotCount === 1 ? 'slot' : 'slots'}
          </p>
        </div>

        <LinkBox
          label="Guest invite link — send this to the group"
          url={board.inviteUrl}
          copyLabel="Copy invite link"
          onCopied={() => setToast('Invite link copied')}
          onCopyFailed={copyFailed}
        />

        <div className="flex flex-col gap-s1">
          <LinkBox
            label="Your host link — keep this private"
            url={board.hostUrl}
            copyLabel="Copy host link"
            onCopied={() => {
              setHostCopied(true);
              setToast('Host link copied');
            }}
            onCopyFailed={copyFailed}
          />
          <p className="text-sm/[1.5] text-muted">
            Anyone with the host link can lock the board and remove claims. Open it on another
            device to manage from there.
          </p>
        </div>

        <Banner tone="warn" icon="🔑">
          We can't show the host link again. Save it now (bookmark or password manager).
        </Banner>

        <ButtonLink to={`/events/${board.eventId}`}>Go to the board</ButtonLink>
      </div>
      <Toast message={toast} onDismiss={dismiss} />
    </section>
  );
}
