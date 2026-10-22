import { CATEGORIES, type Category, LIMITS, type Snapshot } from '@dishpatch/shared';
import { useIsMutating } from '@tanstack/react-query';
import { type FormEvent, useCallback, useId, useRef, useState } from 'react';
import { Navigate, useNavigate, useParams } from 'react-router';
import { ApiRequestError } from '../api/client.ts';
import {
  deleteBoardKey,
  useAddSlot,
  useDeleteBoard,
  useRemoveSlot,
  useRotateInvite,
  useSetLocked,
} from '../api/queries.ts';
import { useBoardStream } from '../api/use-board-stream.ts';
import { CATEGORY_LABELS } from '../categories.ts';
import {
  BackToBoard,
  CARD,
  LoadFailedBanner,
  useConnectionInHeader,
} from '../components/BoardPage.tsx';
import { Button } from '../components/Button.tsx';
import { Dialog } from '../components/Dialog.tsx';
import { LinkBox } from '../components/LinkBox.tsx';
import { Skeleton } from '../components/Skeleton.tsx';
import { Stepper } from '../components/Stepper.tsx';
import { Switch } from '../components/Switch.tsx';
import { TextField } from '../components/TextField.tsx';
import { Toast, type ToastAction, type ToastRole } from '../components/Toast.tsx';
import { NotFoundScreen } from './NotFoundScreen.tsx';

const card = CARD;
const dangerCard = 'rounded-lg border border-error bg-surface p-s5 shadow-e1';
/** A setting row: text, then its control — stacked on mobile, side by side from tablet up. */
const setting =
  'flex flex-col items-start gap-s4 tablet:flex-row tablet:items-center tablet:justify-between';
/** The one error toast for a host control that didn't save (03-design.md › host › error). */
const SAVE_FAILED = "Couldn't save — try again";
/** Inline under the slot steppers (02-user-flows.md › Flow F › F12, F15). */
const SLOT_ERRORS: Record<string, string> = {
  SLOT_CLAIMED: 'Remove the claim first — someone just claimed that slot.',
  SLOT_LIMIT: `A board can have up to ${LIMITS.slotsTotalMax} slots, ${LIMITS.slotsPerCategoryMax} per category.`,
};

interface ToastState {
  message: string;
  role: ToastRole;
  action?: ToastAction | undefined;
}

/**
 * Host settings (F6.4, 03-design.md › host): lock, new invite link, slot counts and delete.
 * A guest who opens this address gets notfound (02-user-flows.md › Flow F); the API refuses
 * them anyway (E1).
 */
export function HostScreen() {
  const { eventId = '' } = useParams();
  const { query, board, connection, presence } = useBoardStream(eventId);
  const [toast, setToast] = useState<ToastState | null>(null);
  const showToast = useCallback(
    (message: string, role: ToastRole = 'status', action?: ToastAction) =>
      setToast({ message, role, action }),
    [],
  );
  const dismissToast = useCallback(() => setToast(null), []);

  const deleting = useIsMutating({ mutationKey: deleteBoardKey(eventId) }) > 0;
  useConnectionInHeader(connection, presence);

  // Our own delete: the stream's `event.deleted` can beat the 204, so finish the redirect here too.
  if (connection === 'notfound' && deleting) return <BoardDeleted />;
  if (connection === 'notfound' || (board && board.me.role !== 'host')) return <NotFoundScreen />;

  let content = (
    <div role="status" aria-label="Loading host settings" className="flex flex-col gap-s4">
      <Skeleton className="h-24 rounded-lg" />
      <Skeleton className="h-24 rounded-lg" />
      <Skeleton className="h-48 rounded-lg" />
    </div>
  );
  if (board) {
    content = <HostSettings board={board} onToast={showToast} />;
  } else if (query.isError) {
    content = <LoadFailedBanner onRetry={() => void query.refetch()} />;
  }

  return (
    <section aria-labelledby="host-h" className="mx-auto max-w-[760px] p-s4 tablet:p-s6">
      <BackToBoard />
      <h1 id="host-h" className="mb-s5 text-[30px] leading-[1.1] tablet:text-[40px]">
        Host settings
      </h1>
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

/** Where a deleted board sends its host (03-design.md › host › Interactions). */
function BoardDeleted() {
  return <Navigate to="/" replace state={{ toast: 'Board deleted' }} />;
}

type OnToast = (message: string, role?: ToastRole, action?: ToastAction) => void;

function HostSettings({ board, onToast }: { board: Snapshot; onToast: OnToast }) {
  const eventId = board.event.id;
  const setLocked = useSetLocked(eventId);
  const rotate = useRotateInvite(eventId);
  const [inviteUrl, setInviteUrl] = useState<string | null>(null);
  const [confirmingDelete, setConfirmingDelete] = useState(false);

  const toggleLock = (locked: boolean) =>
    setLocked.mutate(locked, {
      onSuccess: () => onToast(locked ? 'Board locked' : 'Board unlocked'),
      onError: () => onToast(SAVE_FAILED, 'alert'),
    });

  const copy = (url: string) => () => {
    void navigator.clipboard.writeText(url).then(
      () => onToast('Invite link copied'),
      () => onToast('Press Ctrl/⌘+C to copy', 'alert'),
    );
  };

  const newLink = () =>
    rotate.mutate(undefined, {
      onSuccess: ({ inviteUrl: url }) => {
        setInviteUrl(url);
        onToast('New invite link ready', 'status', { label: 'Copy', onClick: copy(url) });
      },
      onError: () => onToast(SAVE_FAILED, 'alert'),
    });

  return (
    <div className="flex flex-col gap-s4">
      <div className={`${card} ${setting}`}>
        <div>
          <h2 className="text-lg leading-[1.3]">Lock the board</h2>
          <p className="text-sm text-muted">
            Stops new claims and releases. Guests can still see the board.
          </p>
        </div>
        <Switch
          label="Lock the board"
          checked={board.event.locked}
          disabled={setLocked.isPending}
          onChange={toggleLock}
        />
      </div>

      <div className={`${card} flex flex-col gap-s4`}>
        <div className={setting}>
          <div>
            <h2 className="text-lg leading-[1.3]">Make a new invite link</h2>
            <p className="text-sm text-muted">
              The old link stops working. People who already joined stay on the board.
            </p>
          </div>
          <Button
            variant="secondary"
            loading={rotate.isPending}
            loadingLabel="Making link…"
            onClick={newLink}
          >
            New link
          </Button>
        </div>
        {inviteUrl ? (
          <LinkBox
            label="New invite link"
            url={inviteUrl}
            copyLabel="Copy the new invite link"
            onCopied={() => onToast('Invite link copied')}
            onCopyFailed={() => onToast('Press Ctrl/⌘+C to copy', 'alert')}
          />
        ) : null}
      </div>

      <SlotSettings board={board} onToast={onToast} />

      <div className={`${dangerCard} ${setting}`}>
        <div>
          <h2 className="text-lg leading-[1.3]">Delete this board</h2>
          <p className="text-sm text-muted">
            Removes the board, every claim and every guest name now. This can't be undone.
          </p>
        </div>
        <Button variant="danger" onClick={() => setConfirmingDelete(true)}>
          Delete board
        </Button>
      </div>

      {confirmingDelete ? (
        <DeleteDialog board={board} onClose={() => setConfirmingDelete(false)} onToast={onToast} />
      ) : null}
    </div>
  );
}

/** Per-category steppers: + adds an open slot, − removes the last open one (never a claimed one). */
function SlotSettings({ board, onToast }: { board: Snapshot; onToast: OnToast }) {
  const eventId = board.event.id;
  const add = useAddSlot(eventId);
  const remove = useRemoveSlot(eventId);
  const busy = add.isPending || remove.isPending;
  const total = board.slots.length;
  const [inlineError, setInlineError] = useState<string | null>(null);

  const change = (category: Category, next: number, current: number) => {
    setInlineError(null);
    const onError = (err: unknown) => {
      const inline = err instanceof ApiRequestError ? SLOT_ERRORS[err.code] : undefined;
      if (inline) setInlineError(inline);
      else onToast(SAVE_FAILED, 'alert');
    };
    if (next > current) {
      add.mutate(category, { onError });
      return;
    }
    const open = board.slots
      .filter((s) => s.category === category && !s.claimedBy)
      .sort((a, b) => b.position - a.position);
    const [last] = open;
    if (last) remove.mutate(last, { onError });
  };

  return (
    <div className={card}>
      <h2 className="text-lg leading-[1.3]">Slots</h2>
      <p className="text-sm text-muted">
        Add open slots or remove empty ones. Remove a claim first to delete a claimed slot.
      </p>
      <ul className="mt-s3 flex flex-col">
        {CATEGORIES.map((category) => {
          const { plural, singular, dot } = CATEGORY_LABELS[category];
          const inCategory = board.slots.filter((s) => s.category === category);
          const claimed = inCategory.filter((s) => s.claimedBy).length;
          const count = inCategory.length;
          const max = Math.min(LIMITS.slotsPerCategoryMax, count + LIMITS.slotsTotalMax - total);
          return (
            <li
              key={category}
              className="flex items-center justify-between gap-s3 border-b border-dashed border-border py-s3 last:border-b-0"
            >
              <span className="flex items-center gap-s2 font-bold">
                <span aria-hidden="true" className={`size-3 rounded-[4px] ${dot}`} />
                {plural}
                {claimed > 0 ? (
                  <span className="text-sm font-semibold text-muted">· {claimed} claimed</span>
                ) : null}
              </span>
              <Stepper
                noun={plural.toLowerCase()}
                value={count}
                min={claimed}
                max={max}
                disabled={busy}
                decreaseLabel={`Remove an empty ${singular} slot`}
                increaseLabel={`Add a ${singular} slot`}
                minReason={claimed > 0 ? 'Remove a claim first' : undefined}
                onChange={(next) => change(category, next, count)}
              />
            </li>
          );
        })}
      </ul>
      {inlineError ? (
        <p role="alert" className="mt-s2 text-sm font-semibold text-error">
          {inlineError}
        </p>
      ) : null}
    </div>
  );
}

/** The typed confirmation (03-design.md › host/confirm): Delete stays off until the name matches. */
function DeleteDialog({
  board,
  onClose,
  onToast,
}: {
  board: Snapshot;
  onClose: () => void;
  onToast: OnToast;
}) {
  const headingId = useId();
  const fieldRef = useRef<HTMLInputElement>(null);
  const navigate = useNavigate();
  const remove = useDeleteBoard(board.event.id);
  const [typed, setTyped] = useState('');
  const [error, setError] = useState<string>();
  const { title } = board.event;
  const matches = typed === title;
  const guests = board.participants.length;
  const claims = board.slots.filter((s) => s.claimedBy).length;

  const submit = (e: FormEvent) => {
    e.preventDefault();
    if (!matches || remove.isPending) return;
    remove.mutate(typed, {
      onSuccess: () => navigate('/', { replace: true, state: { toast: 'Board deleted' } }),
      onError: (err) => {
        if (err instanceof ApiRequestError && err.code === 'CONFIRM_MISMATCH') {
          setError(err.message);
          fieldRef.current?.focus();
        } else {
          onToast(SAVE_FAILED, 'alert');
        }
      },
    });
  };

  return (
    <Dialog labelledBy={headingId} onClose={onClose} initialFocus={fieldRef} role="alertdialog">
      <form noValidate onSubmit={submit} className="flex flex-col gap-s5">
        <div>
          <h2 id={headingId} className="text-2xl leading-[1.2]">
            Delete “{title}”?
          </h2>
          <p className="mt-s3 text-muted">
            {guests} {guests === 1 ? 'guest' : 'guests'} and {claims}{' '}
            {claims === 1 ? 'claim' : 'claims'} will be removed for everyone, right now. Type the
            event name to confirm.
          </p>
        </div>
        <TextField
          ref={fieldRef}
          id={`${headingId}-name`}
          label="Event name"
          value={typed}
          placeholder={title}
          autoComplete="off"
          disabled={remove.isPending}
          error={error}
          onChange={(e) => {
            setTyped(e.target.value);
            setError(undefined);
          }}
        />
        <div className="flex flex-col-reverse gap-s3 tablet:flex-row tablet:justify-end">
          <Button variant="secondary" onClick={onClose} disabled={remove.isPending}>
            Keep board
          </Button>
          <Button
            type="submit"
            variant="danger"
            disabled={!matches}
            loading={remove.isPending}
            loadingLabel="Deleting…"
          >
            Delete for everyone
          </Button>
        </div>
      </form>
    </Dialog>
  );
}
