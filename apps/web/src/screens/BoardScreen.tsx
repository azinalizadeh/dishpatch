import {
  CATEGORIES,
  DIETARY_LABELS,
  type SequencedBoardEvent,
  type SlotView,
  type Snapshot,
} from '@dishpatch/shared';
import { useCallback, useEffect, useState } from 'react';
import { useParams, useSearchParams } from 'react-router';
import { ApiRequestError, NetworkError } from '../api/client.ts';
import { useReleaseSlot } from '../api/queries.ts';
import { type Connection, useBoardStream } from '../api/use-board-stream.ts';
import { CATEGORY_LABELS } from '../categories.ts';
import { useShell } from '../components/AppShell.tsx';
import { Avatar } from '../components/Avatar.tsx';
import { Banner } from '../components/Banner.tsx';
import { Button, ButtonLink } from '../components/Button.tsx';
import { CategoryGroup, CategoryGroupSkeleton } from '../components/CategoryGroup.tsx';
import { ConnectionIndicator } from '../components/ConnectionIndicator.tsx';
import { Skeleton } from '../components/Skeleton.tsx';
import type { OpenSlotState } from '../components/SlotCard.tsx';
import { Tag } from '../components/Tag.tsx';
import { Toast } from '../components/Toast.tsx';
import { formatWhen } from '../format.ts';
import { ClaimDialog } from './ClaimDialog.tsx';
import { NotFoundScreen } from './NotFoundScreen.tsx';

const card = 'rounded-lg border border-border bg-surface p-s5 shadow-e1';

/**
 * The live board (F3.6, 03-design.md › board): slot groups and "Who's coming", kept current by
 * the stream. States: loading, empty, offline (claims paused), locked (claims closed), error.
 * Claims (F4) open the claim dialog at `?claim=<slotId>`; coverage arrives with F5.
 */
export function BoardScreen() {
  const { eventId = '' } = useParams();
  const [searchParams, setSearchParams] = useSearchParams();
  const claimSlotId = searchParams.get('claim');
  const [toast, setToast] = useState<{ message: string; role: 'status' | 'alert' } | null>(null);
  const showToast = useCallback(
    (message: string, role: 'status' | 'alert' = 'status') => setToast({ message, role }),
    [],
  );
  const dismissToast = useCallback(() => setToast(null), []);

  const onEvent = useCallback(
    (msg: SequencedBoardEvent, before: Snapshot) => {
      const conflict = conflictToast(msg, before, claimSlotId);
      if (conflict) showToast(conflict, 'alert');
    },
    [claimSlotId, showToast],
  );
  const { query, board, connection, presence, announcement } = useBoardStream(eventId, onEvent);
  const { setHeaderEnd } = useShell();
  const release = useReleaseSlot(eventId);

  useEffect(() => {
    setHeaderEnd(<ConnectionIndicator connection={connection} presence={presence} />);
  }, [setHeaderEnd, connection, presence]);
  useEffect(() => () => setHeaderEnd(null), [setHeaderEnd]);

  // The claim dialog (F4) is `?claim=<slotId>` on this route.
  const openClaim = useCallback(
    (slot: SlotView) => setSearchParams({ claim: slot.id }),
    [setSearchParams],
  );
  const closeClaim = useCallback(() => setSearchParams({}, { replace: true }), [setSearchParams]);
  const releaseSlot = useCallback(
    (slot: SlotView) =>
      release.mutate(
        { slot },
        {
          onError: (err) => {
            if (err instanceof NetworkError) showToast("Couldn't reach Dishpatch — try again.");
            else if (err instanceof ApiRequestError && err.code === 'NOT_OWNER') {
              showToast("That isn't your claim.");
            } else if (
              !(err instanceof ApiRequestError) ||
              !['BOARD_LOCKED', 'NOT_CLAIMED', 'NOT_FOUND'].includes(err.code)
            ) {
              showToast(err.message);
            }
          },
        },
      ),
    [release, showToast],
  );

  if (connection === 'notfound') return <NotFoundScreen />;

  let content = <BoardSkeleton />;
  if (board) {
    content = (
      <>
        <LiveBoard
          board={board}
          connection={connection}
          onClaim={openClaim}
          onRelease={releaseSlot}
        />
        {claimSlotId && connection !== 'reconnecting' ? (
          <ClaimDialog
            board={board}
            slotId={claimSlotId}
            onClose={closeClaim}
            onToast={showToast}
          />
        ) : null}
      </>
    );
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
      <Toast message={toast?.message ?? null} role={toast?.role} onDismiss={dismissToast} />
    </section>
  );
}

/**
 * Toast copy for a change that takes something away from the viewer (03-design.md › board ›
 * conflict): the host removing their claim, or someone taking the last open slot of a category.
 * The open claim dialog explains its own slot, so that one gets no toast.
 */
function conflictToast(
  msg: SequencedBoardEvent,
  before: Snapshot,
  dialogSlotId: string | null,
): string | null {
  const meId = before.me.participantId;
  if (msg.type === 'slot.released' && msg.actorRole === 'host' && before.me.role !== 'host') {
    const slot = before.slots.find((s) => s.id === msg.slotId);
    if (slot?.claimedBy?.id !== meId) return null;
    const host = before.participants.find((p) => p.role === 'host')?.displayName ?? 'The host';
    return `${host} removed your claim on '${slot.dishName}'.`;
  }
  if (msg.type === 'slot.claimed' && msg.slot.claimedBy && msg.slot.claimedBy.id !== meId) {
    if (msg.slot.id === dialogSlotId) return null;
    const stillOpen = before.slots.filter(
      (s) => s.category === msg.slot.category && !s.claimedBy && s.id !== msg.slot.id,
    );
    if (stillOpen.length > 0) return null;
    const { singular } = CATEGORY_LABELS[msg.slot.category];
    return `${msg.slot.claimedBy.displayName} just took the last ${singular} slot.`;
  }
  return null;
}

function LiveBoard({
  board,
  connection,
  onClaim,
  onRelease,
}: {
  board: Snapshot;
  connection: Connection;
  onClaim: (slot: SlotView) => void;
  onRelease: (slot: SlotView) => void;
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
                releasable={!offline && !event.locked}
                isHost={me.role === 'host'}
                onClaim={onClaim}
                onRelease={onRelease}
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
