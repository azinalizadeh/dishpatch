import { CATEGORIES, DIETARY_LABELS, type SlotView, type Snapshot } from '@dishpatch/shared';
import { useCallback, useEffect } from 'react';
import { useParams, useSearchParams } from 'react-router';
import { type Connection, useBoardStream } from '../api/use-board-stream.ts';
import { useShell } from '../components/AppShell.tsx';
import { Avatar } from '../components/Avatar.tsx';
import { Banner } from '../components/Banner.tsx';
import { Button, ButtonLink } from '../components/Button.tsx';
import { CategoryGroup, CategoryGroupSkeleton } from '../components/CategoryGroup.tsx';
import { ConnectionIndicator } from '../components/ConnectionIndicator.tsx';
import { Skeleton } from '../components/Skeleton.tsx';
import type { OpenSlotState } from '../components/SlotCard.tsx';
import { Tag } from '../components/Tag.tsx';
import { formatWhen } from '../format.ts';
import { NotFoundScreen } from './NotFoundScreen.tsx';

const card = 'rounded-lg border border-border bg-surface p-s5 shadow-e1';

/**
 * The live board (F3.6, 03-design.md › board): slot groups and "Who's coming", kept current by
 * the stream. States: loading, empty, offline (claims paused), locked (claims closed), error.
 * Coverage (sidebar card and mobile banner) and claiming arrive with F5 and F4.
 */
export function BoardScreen() {
  const { eventId = '' } = useParams();
  const { query, board, connection, presence, announcement } = useBoardStream(eventId);
  const { setHeaderEnd } = useShell();
  const [, setSearchParams] = useSearchParams();

  useEffect(() => {
    setHeaderEnd(<ConnectionIndicator connection={connection} presence={presence} />);
  }, [setHeaderEnd, connection, presence]);
  useEffect(() => () => setHeaderEnd(null), [setHeaderEnd]);

  // The claim dialog (F4) is `?claim=<slotId>` on this route.
  const openClaim = useCallback(
    (slot: SlotView) => setSearchParams({ claim: slot.id }),
    [setSearchParams],
  );

  if (connection === 'notfound') return <NotFoundScreen />;

  let content = <BoardSkeleton />;
  if (board) {
    content = <LiveBoard board={board} connection={connection} onClaim={openClaim} />;
  } else if (query.isError) {
    content = (
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
    );
  }

  return (
    <section aria-labelledby="board-h" className="mx-auto max-w-[1200px] p-s4 tablet:p-s6">
      {/* The one polite live region for board changes, throttled in useBoardStream. */}
      <p aria-live="polite" className="sr-only">
        {announcement}
      </p>
      {content}
    </section>
  );
}

function LiveBoard({
  board,
  connection,
  onClaim,
}: {
  board: Snapshot;
  connection: Connection;
  onClaim: (slot: SlotView) => void;
}) {
  const { event, slots, participants, me } = board;
  const host = participants.find((p) => p.role === 'host');
  const claimed = slots.filter((s) => s.claimedBy).length;
  const offline = connection === 'reconnecting';
  let openState: OpenSlotState = 'claimable';
  if (offline) openState = 'paused';
  else if (event.locked) openState = 'closed';

  return (
    <>
      {offline ? (
        <div className="mb-s4">
          <Banner tone="error" icon="⟳" role="status">
            Connection lost. Reconnecting… Claims are paused until you're back.
          </Banner>
        </div>
      ) : null}
      {event.locked ? (
        <div className="mb-s4">
          <Banner tone="warn" icon="🔒" role="status">
            {host?.displayName ?? 'The host'} locked the board. You can still look, but claims are
            closed.
          </Banner>
        </div>
      ) : null}

      <div className="mb-s5 flex flex-wrap items-end justify-between gap-s5">
        <div>
          <h1 id="board-h" className="text-[30px] leading-[1.1] tablet:text-[40px]">
            {event.title}
          </h1>
          <p className="mt-s2 flex flex-wrap gap-x-s4 gap-y-s1 text-sm font-semibold text-muted">
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
            <span>
              <span aria-hidden="true">🍽 </span>
              {claimed} of {slots.length} claimed
            </span>
          </p>
        </div>
        {me.role === 'host' ? (
          <ButtonLink variant="secondary" to="host" relative="path" className="max-tablet:hidden">
            Host settings
          </ButtonLink>
        ) : null}
      </div>

      <div className="grid items-start gap-s5 tablet:grid-cols-[1fr_340px]">
        <div className="flex flex-col gap-s5">
          {claimed === 0 ? (
            <Banner tone="ok" icon="🍽">
              Nothing claimed yet. Be the first — pick any open slot.
            </Banner>
          ) : null}
          {CATEGORIES.map((category) => {
            const inCategory = slots.filter((s) => s.category === category);
            return inCategory.length === 0 ? null : (
              <CategoryGroup
                key={category}
                category={category}
                slots={inCategory}
                meId={me.participantId}
                hostId={host?.id}
                openState={openState}
                onClaim={onClaim}
              />
            );
          })}
        </div>

        <aside aria-label="Guests" className="flex flex-col gap-s4 max-tablet:hidden">
          <div className={card}>
            <h2 className="text-lg leading-[1.3]">
              Who's coming{' '}
              <span className="font-sans text-sm font-semibold text-muted">
                ({participants.length})
              </span>
            </h2>
            <ul aria-label="Who's coming" className="mt-s3 flex flex-col gap-s2">
              {participants.map((p) => (
                <li key={p.id} className="flex items-center gap-s2 text-sm">
                  <Avatar name={p.displayName} host={p.role === 'host'} />
                  <span className="flex-1">
                    {p.displayName}
                    {p.id === me.participantId ? ' (you)' : ''}
                  </span>
                  {p.role === 'host' ? (
                    <Tag>Host</Tag>
                  ) : (
                    p.dietaryNeeds.map((need) => <Tag key={need}>{DIETARY_LABELS[need]}</Tag>)
                  )}
                </li>
              ))}
            </ul>
          </div>
        </aside>
      </div>
    </>
  );
}

function BoardSkeleton() {
  return (
    <div role="status" aria-label="Loading the board">
      <div className="mb-s5">
        <Skeleton className="h-10 w-2/3 max-w-[480px] rounded-md" />
        <Skeleton className="mt-s3 h-4 w-64 rounded-md" />
      </div>
      <div className="grid items-start gap-s5 tablet:grid-cols-[1fr_340px]">
        <div className="flex flex-col gap-s5">
          <CategoryGroupSkeleton />
          <CategoryGroupSkeleton />
          <CategoryGroupSkeleton />
        </div>
        <div className={`${card} max-tablet:hidden`}>
          <Skeleton className="h-32 rounded-md" />
        </div>
      </div>
    </div>
  );
}
