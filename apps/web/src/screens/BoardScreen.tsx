import {
  CATEGORIES,
  computeCoverage,
  DIETARY_LABELS,
  type SequencedBoardEvent,
  type SlotView,
  type Snapshot,
  topHint,
} from '@dishpatch/shared';
import { useCallback, useMemo, useState } from 'react';
import { Link, useParams, useSearchParams } from 'react-router';
import { ApiRequestError, NetworkError } from '../api/client.ts';
import {
  BOARD_CHANGED,
  NETWORK_ERROR_COPY,
  usePendingSlotIds,
  useReleaseSlot,
} from '../api/queries.ts';
import { type Connection, useBoardStream } from '../api/use-board-stream.ts';
import { CATEGORY_LABELS } from '../categories.ts';
import { Avatar } from '../components/Avatar.tsx';
import { Banner } from '../components/Banner.tsx';
import { CARD as card, LoadFailedBanner, useConnectionInHeader } from '../components/BoardPage.tsx';
import { ButtonLink } from '../components/Button.tsx';
import { CategoryGroup, CategoryGroupSkeleton } from '../components/CategoryGroup.tsx';
import { CoverageMeter } from '../components/CoverageMeter.tsx';
import { Skeleton } from '../components/Skeleton.tsx';
import type { OpenSlotState } from '../components/SlotCard.tsx';
import { Tag } from '../components/Tag.tsx';
import { Toast, type ToastAction, type ToastRole } from '../components/Toast.tsx';
import { coverageSummary } from '../coverage-copy.ts';
import { formatWhen } from '../format.ts';
import { ClaimDialog } from './ClaimDialog.tsx';
import { NotFoundScreen } from './NotFoundScreen.tsx';

/**
 * The live board (F3.6, 03-design.md › board): slot groups and "Who's coming", kept current by
 * the stream. States: loading, empty, offline (claims paused), locked (claims closed), error.
 * Claims (F4) open the claim dialog at `?claim=<slotId>`. Coverage (F5) is recomputed from the
 * live slots with the shared rules, so it follows claims (optimistic ones too) as they happen.
 */
export function BoardScreen() {
  const { eventId = '' } = useParams();
  const [searchParams, setSearchParams] = useSearchParams();
  const claimSlotId = searchParams.get('claim');
  const [toast, setToast] = useState<{
    message: string;
    role: ToastRole;
    action?: ToastAction | undefined;
  } | null>(null);
  const showToast = useCallback(
    (message: string, role: ToastRole = 'status', action?: ToastAction) =>
      setToast({ message, role, action }),
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
  const { mutate: release } = useReleaseSlot(eventId);
  const pendingSlotIds = usePendingSlotIds(eventId);

  useConnectionInHeader(connection, presence);

  // The claim dialog (F4) is `?claim=<slotId>` on this route.
  const openClaim = useCallback(
    (slot: SlotView) => setSearchParams({ claim: slot.id }),
    [setSearchParams],
  );
  const closeClaim = useCallback(() => setSearchParams({}, { replace: true }), [setSearchParams]);
  const releaseSlot = useCallback(
    function releaseWithRetry(slot: SlotView) {
      release(
        { slot },
        {
          onError: (err) => {
            if (err instanceof NetworkError) {
              showToast(NETWORK_ERROR_COPY, 'alert', {
                label: 'Try again',
                onClick: () => releaseWithRetry(slot),
              });
            } else if (err instanceof ApiRequestError && err.code === 'NOT_OWNER') {
              showToast("That isn't your claim.", 'alert');
            } else if (!(err instanceof ApiRequestError) || !BOARD_CHANGED.has(err.code)) {
              showToast(err.message, 'alert');
            }
          },
        },
      );
    },
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
          pendingSlotIds={pendingSlotIds}
        />
        {claimSlotId ? (
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
    content = <LoadFailedBanner onRetry={() => void query.refetch()} />;
  }

  return (
    <section aria-labelledby="board-h" className="mx-auto max-w-[1200px] p-s4 tablet:p-s6">
      {/* The one polite live region for board changes, throttled in useBoardStream. */}
      <p aria-live="polite" className="sr-only">
        {announcement}
      </p>
      {content}
      <Toast
        message={toast?.message ?? null}
        role={toast?.role}
        action={toast?.action}
        onDismiss={dismissToast}
      />
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
  pendingSlotIds,
}: {
  board: Snapshot;
  connection: Connection;
  onClaim: (slot: SlotView) => void;
  onRelease: (slot: SlotView) => void;
  pendingSlotIds: ReadonlySet<string>;
}) {
  const { event, slots, participants, me } = board;
  const host = participants.find((p) => p.role === 'host');
  const claimed = slots.filter((s) => s.claimedBy).length;
  const coverage = useMemo(() => computeCoverage(participants, slots), [participants, slots]);
  const hint = topHint(coverage);
  const summary = coverageSummary(coverage);
  const hintText = hint ? `${DIETARY_LABELS[hint.need]} would help` : undefined;
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
          <ButtonLink variant="secondary" to="host" relative="path">
            Host settings
          </ButtonLink>
        ) : null}
      </div>

      {summary && claimed > 0 ? (
        // Mobile stands in for the sidebar card with one line (03-design.md › board › Layout);
        // the empty board shows its own banner instead (board/empty).
        <Link
          to="coverage"
          relative="path"
          className="mb-s4 flex items-start gap-s3 rounded-md bg-warn-bg px-s4 py-s3 text-sm/[1.5] font-semibold text-warn-ink no-underline tablet:hidden"
        >
          <span aria-hidden="true" className="text-lg leading-[1.2]">
            ⚠
          </span>
          <span>
            {summary}. <u>See coverage</u>
          </span>
        </Link>
      ) : null}

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
                pendingSlotIds={pendingSlotIds}
                hint={hint?.categories === 'any' || category === 'main' ? hintText : undefined}
              />
            );
          })}
        </div>

        <aside
          aria-label="Dietary coverage and guests"
          className="flex flex-col gap-s4 max-tablet:hidden"
        >
          <section aria-labelledby="coverage-h" className={card}>
            <h2 id="coverage-h" className="text-lg leading-[1.3]">
              Dietary coverage
            </h2>
            <p className="mb-s4 text-sm text-muted">
              Based on what {participants.length} {participants.length === 1 ? 'person' : 'guests'}{' '}
              told us.
            </p>
            <CoverageMeter coverage={coverage} variant="compact" />
            <Link
              to="coverage"
              relative="path"
              className="mt-s3 inline-flex min-h-10 items-center font-bold text-primary no-underline"
            >
              Details <span aria-hidden="true">&nbsp;→</span>
            </Link>
          </section>
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
