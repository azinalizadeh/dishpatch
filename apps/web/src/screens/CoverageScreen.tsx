import { computeCoverage } from '@dishpatch/shared';
import { useEffect, useMemo } from 'react';
import { Link, useParams } from 'react-router';
import { useBoardStream } from '../api/use-board-stream.ts';
import { useShell } from '../components/AppShell.tsx';
import { Banner } from '../components/Banner.tsx';
import { Button } from '../components/Button.tsx';
import { ConnectionIndicator } from '../components/ConnectionIndicator.tsx';
import { CoverageMeter } from '../components/CoverageMeter.tsx';
import { NotFoundScreen } from './NotFoundScreen.tsx';

const card = 'rounded-lg border border-border bg-surface p-s5 shadow-e1';

/**
 * Dietary coverage (F5.4, 03-design.md › coverage): every need with guests, gap first, then thin,
 * then covered, with the rules spelled out. Live from the same stream as the board.
 */
export function CoverageScreen() {
  const { eventId = '' } = useParams();
  const { query, board, connection, presence } = useBoardStream(eventId);
  const { setHeaderEnd } = useShell();
  const coverage = useMemo(
    () => (board ? computeCoverage(board.participants, board.slots) : undefined),
    [board],
  );

  useEffect(() => {
    setHeaderEnd(<ConnectionIndicator connection={connection} presence={presence} />);
  }, [setHeaderEnd, connection, presence]);
  useEffect(() => () => setHeaderEnd(null), [setHeaderEnd]);

  if (connection === 'notfound') return <NotFoundScreen />;

  let content = (
    <>
      <div className={`${card} mt-s5`}>
        <CoverageMeter coverage={coverage} variant="full" />
      </div>
      <div className={`${card} mt-s4`}>
        <h2 className="text-lg leading-[1.3]">How we decide</h2>
        <ul className="mt-s2 flex list-disc flex-col gap-s1 pl-s5 text-sm text-muted">
          <li>
            <b>Covered</b>: at least one compatible main, plus one more compatible dish.
          </li>
          <li>
            <b>Thin</b>: compatible dishes exist, but no compatible main.
          </li>
          <li>
            <b>Gap</b>: guests need it and nothing on the board fits.
          </li>
          <li>Vegan dishes count as vegetarian and dairy-free too.</li>
        </ul>
        <p className="mt-s3 text-sm text-muted">
          Only people on this board can see these needs, and they're deleted with the board.
        </p>
      </div>
    </>
  );
  if (query.isError && !board) {
    content = (
      <div className="mt-s5">
        <Banner
          tone="error"
          icon="!"
          role="alert"
          action={
            <Button variant="ghost" size="sm" onClick={() => void query.refetch()}>
              Try again
            </Button>
          }
        >
          Something broke on our side. Please try again.
        </Banner>
      </div>
    );
  } else if (coverage?.length === 0) {
    content = (
      <div className="mt-s5">
        <CoverageMeter coverage={coverage} variant="full" />
      </div>
    );
  }

  return (
    <section aria-labelledby="coverage-page-h" className="mx-auto max-w-[760px] p-s4 tablet:p-s6">
      <BackToBoard />
      <h1 id="coverage-page-h" className="text-[30px] leading-[1.1] tablet:text-[40px]">
        Dietary coverage
      </h1>
      <p className="mt-[6px] text-muted">
        What guests need vs. what's on the board. Updates live as dishes are claimed.
      </p>
      {content}
    </section>
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
