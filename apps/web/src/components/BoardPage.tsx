import { useEffect } from 'react';
import { Link } from 'react-router';
import type { Connection } from '../api/use-board-stream.ts';
import { useShell } from './AppShell.tsx';
import { Banner } from './Banner.tsx';
import { Button } from './Button.tsx';
import { ConnectionIndicator } from './ConnectionIndicator.tsx';

/** The white panel the board, coverage and host screens are built from (design/mockup.html › .card). */
export const CARD = 'rounded-lg border border-border bg-surface p-s5 shadow-e1';

/** Shows the board's live/reconnecting state in the top bar while a board screen is open. */
export function useConnectionInHeader(connection: Connection, presence: number | null) {
  const { setHeaderEnd } = useShell();
  useEffect(() => {
    setHeaderEnd(<ConnectionIndicator connection={connection} presence={presence} />);
  }, [setHeaderEnd, connection, presence]);
  useEffect(() => () => setHeaderEnd(null), [setHeaderEnd]);
}

/** The snapshot failed to load (5xx): one banner with "Try again" (03-design.md › board › error). */
export function LoadFailedBanner({ onRetry }: { onRetry: () => void }) {
  return (
    <Banner
      tone="error"
      icon="!"
      role="alert"
      action={
        <Button variant="ghost" size="sm" onClick={onRetry}>
          Try again
        </Button>
      }
    >
      Something broke on our side. Please try again.
    </Banner>
  );
}

/** "← Back to board" from a board sub-screen (coverage, host settings). */
export function BackToBoard() {
  return (
    <Link
      to=".."
      relative="path"
      className="mb-s2 inline-flex min-h-10 items-center font-bold text-primary no-underline"
    >
      <span aria-hidden="true">←&nbsp;</span>Back to board
    </Link>
  );
}
