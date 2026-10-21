import {
  ClaimInput,
  DIETARY,
  DIETARY_LABELS,
  type Dietary,
  type Snapshot,
} from '@dishpatch/shared';
import { type FormEvent, useEffect, useId, useRef, useState } from 'react';
import { ApiRequestError, NetworkError } from '../api/client.ts';
import { useClaimSlot } from '../api/queries.ts';
import { CATEGORY_LABELS } from '../categories.ts';
import { Banner } from '../components/Banner.tsx';
import { Button } from '../components/Button.tsx';
import { Chip } from '../components/Chip.tsx';
import { Dialog } from '../components/Dialog.tsx';
import { TextField } from '../components/TextField.tsx';

interface ClaimDialogProps {
  board: Snapshot;
  slotId: string;
  onClose: () => void;
  /** For problems the dialog survives, like a dropped connection (02-user-flows.md › D14). */
  onToast: (message: string) => void;
}

const ORDINALS = ['first', 'second', 'third', 'fourth', 'fifth', 'sixth', 'seventh', 'eighth'];

/** "Pick another open main — the third one is still free." (03-design.md › claim › error) */
function pickAnotherHint(board: Snapshot, slotId: string): string {
  const slot = board.slots.find((s) => s.id === slotId);
  if (!slot) return '';
  const { singular } = CATEGORY_LABELS[slot.category];
  const inCategory = board.slots.filter((s) => s.category === slot.category);
  const open = inCategory.filter((s) => s.id !== slotId && !s.claimedBy);
  const [only] = open;
  if (open.length === 0) return 'Pick an open slot in another category.';
  if (open.length > 1) return `Pick another open ${singular} — ${open.length} are still free.`;
  const ordinal = ORDINALS[inCategory.indexOf(only as (typeof inCategory)[number])];
  return ordinal
    ? `Pick another open ${singular} — the ${ordinal} one is still free.`
    : `Pick another open ${singular} — one is still free.`;
}

/**
 * The claim dialog (F4.6, 03-design.md › claim). Submitting shows the card on the board at once;
 * a 409 rolls it back and explains who won. If the stream reports someone else's claim on this
 * slot while the dialog is open, it switches to the same error without the user submitting.
 */
export function ClaimDialog({ board, slotId, onClose, onToast }: ClaimDialogProps) {
  const headingId = useId();
  const dishRef = useRef<HTMLInputElement>(null);
  const [dishName, setDishName] = useState('');
  const [tags, setTags] = useState<Dietary[]>([]);
  const [fieldError, setFieldError] = useState<string>();
  const [problem, setProblem] = useState<string | null>(null);
  const claim = useClaimSlot(board.event.id);

  const slot = board.slots.find((s) => s.id === slotId);
  const meId = board.me.participantId;
  const me = board.participants.find((p) => p.id === meId);
  const takenBy = slot?.claimedBy && slot.claimedBy.id !== meId ? slot.claimedBy.displayName : null;
  const mineAlready = slot?.claimedBy?.id === meId && !claim.isPending;
  const gone = !slot || board.event.locked || mineAlready;

  // A slot that vanished, a board the host locked, or a claim that already went through: close.
  useEffect(() => {
    if (gone) onClose();
  }, [gone, onClose]);
  if (!slot || gone) return null;

  const error = takenBy
    ? `${takenBy} just claimed this slot. ${pickAnotherHint(board, slotId)}`
    : problem;
  const submitting = claim.isPending;
  const { singular, dot } = CATEGORY_LABELS[slot.category];
  const inCategory = board.slots.filter((s) => s.category === slot.category);
  const toggle = (tag: Dietary) =>
    setTags((current) =>
      current.includes(tag) ? current.filter((t) => t !== tag) : [...current, tag],
    );

  const submit = (e: FormEvent) => {
    e.preventDefault();
    if (submitting || error || !me) return;
    const parsed = ClaimInput.safeParse({ dishName, dishTags: tags });
    if (!parsed.success) {
      setFieldError(parsed.error.issues[0]?.message);
      dishRef.current?.focus();
      return;
    }
    setFieldError(undefined);
    claim.mutate(
      { slot, me: { id: me.id, displayName: me.displayName }, input: parsed.data },
      {
        onSuccess: onClose,
        onError: (err) => {
          if (err instanceof NetworkError) {
            onToast("Couldn't reach Dishpatch — try again.");
          } else if (!(err instanceof ApiRequestError)) {
            setProblem('Something went wrong on our side. Please try again.');
          } else if (err.code === 'SLOT_TAKEN') {
            setProblem(
              `${err.claimedBy ?? 'Someone'} just claimed this slot. ${pickAnotherHint(board, slotId)}`,
            );
          } else if (err.code === 'VALIDATION') {
            setFieldError(err.fields.dishName ?? err.message);
          } else if (err.code === 'BOARD_LOCKED' || err.code === 'NOT_FOUND') {
            onClose();
          } else {
            setProblem(err.message);
          }
        },
      },
    );
  };

  return (
    <Dialog labelledBy={headingId} onClose={onClose} initialFocus={dishRef}>
      <form noValidate onSubmit={submit} className="flex flex-col gap-s5">
        <div>
          <p className="flex items-center gap-s2 text-xs font-bold tracking-[0.02em] text-muted uppercase">
            <span aria-hidden="true" className={`size-3 rounded-[4px] ${dot}`} />
            {singular} · slot {inCategory.indexOf(slot) + 1} of {inCategory.length}
          </p>
          <h2 id={headingId} className="mt-[6px] text-2xl leading-[1.2]">
            What are you bringing?
          </h2>
        </div>

        {error ? (
          <Banner tone="error" icon="!" role="alert">
            {error}
          </Banner>
        ) : null}

        <TextField
          ref={dishRef}
          id={`${headingId}-dish`}
          label="Dish"
          value={dishName}
          maxLength={60}
          autoComplete="off"
          disabled={submitting}
          error={fieldError}
          onChange={(e) => setDishName(e.target.value)}
        />

        <fieldset className="m-0 flex flex-col gap-s2 border-0 p-0">
          <legend className="mb-s2 text-sm/[1.5] font-bold">It's suitable for…</legend>
          <div className="flex flex-wrap gap-s2">
            {DIETARY.map((tag) => (
              <Chip
                key={tag}
                pressed={tags.includes(tag)}
                disabled={submitting}
                onToggle={() => toggle(tag)}
              >
                {DIETARY_LABELS[tag]}
              </Chip>
            ))}
          </div>
        </fieldset>

        <div className="flex flex-col-reverse gap-s3 tablet:flex-row tablet:justify-end">
          <Button variant="secondary" onClick={onClose}>
            Cancel
          </Button>
          {error ? (
            <Button onClick={onClose}>Back to board</Button>
          ) : (
            <Button type="submit" loading={submitting} loadingLabel="Claiming…">
              Claim slot
            </Button>
          )}
        </div>
      </form>
    </Dialog>
  );
}
