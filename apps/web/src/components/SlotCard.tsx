import { DIETARY_LABELS, type SlotView } from '@dishpatch/shared';
import { useEffect, useId, useRef, useState } from 'react';
import { CATEGORY_LABELS } from '../categories.ts';
import { Avatar } from './Avatar.tsx';
import { Button } from './Button.tsx';
import { Tag } from './Tag.tsx';

/** Why an open slot can't be claimed right now: offline → "Paused", locked board → "Closed". */
export type OpenSlotState = 'claimable' | 'paused' | 'closed';

interface SlotCardProps {
  slot: SlotView;
  /** 1-based number within its category, for the accessible name. */
  number: number;
  mine: boolean;
  hostId: string | undefined;
  openState: OpenSlotState;
  /** The viewer may release this claim (their own, or anyone's for the host) right now. */
  canRelease: boolean;
  /** A claim or release of this slot is in flight: the card is optimistic (70% opacity). */
  pending: boolean;
  /** Coverage hint chip for an open slot, e.g. "Vegan would help" (US-11). */
  hint?: string | undefined;
  onClaim: (slot: SlotView) => void;
  onRelease: (slot: SlotView) => void;
}

const openLabel: Record<OpenSlotState, string> = {
  claimable: '+ Claim',
  paused: 'Paused',
  closed: 'Closed',
};

/**
 * One slot (03-design.md › SlotCard). Claimed: a tilted "sticker" `<article>`; open: a dashed
 * `<button>` that opens the claim dialog, disabled with "Paused"/"Closed" when claims can't happen.
 */
export function SlotCard({
  slot,
  number,
  mine,
  hostId,
  openState,
  canRelease,
  pending,
  hint,
  onClaim,
  onRelease,
}: SlotCardProps) {
  const { plural: label, singular, border } = CATEGORY_LABELS[slot.category];
  const pop = usePopOnClaim(slot.claimedBy?.id ?? null);
  const hintId = useId();

  if (slot.claimedBy && slot.dishName) {
    const by = slot.claimedBy.displayName;
    return (
      <article
        aria-label={`${label} slot ${number}: ${slot.dishName}, brought by ${by}`}
        aria-busy={pending || undefined}
        onAnimationEnd={pop.done}
        className={`slot-sticker relative flex min-h-24 flex-col justify-between gap-s2 rounded-lg border border-l-8 border-border bg-surface px-s4 py-s3 shadow-e2 ${border} ${
          mine ? 'outline-2 outline-offset-2 outline-primary' : ''
        } ${pending ? 'opacity-70' : ''} ${pop.active ? 'slot-pop' : ''}`}
      >
        <span className={`text-[17px] leading-[1.25] font-bold ${canRelease ? 'pr-s6' : ''}`}>
          {slot.dishName}
        </span>
        <span className="flex items-center gap-s2 text-sm text-muted">
          <Avatar name={by} host={slot.claimedBy.id === hostId} size="sm" />
          {by}
          {mine ? ' · you' : ''}
        </span>
        {slot.dishTags.length > 0 ? (
          <span className="flex flex-wrap gap-s1">
            {slot.dishTags.map((t) => (
              <Tag key={t}>{DIETARY_LABELS[t]}</Tag>
            ))}
          </span>
        ) : null}
        {canRelease && !pending ? (
          <ReleaseControl
            // A new claim in this slot starts with the popover closed.
            key={`${slot.claimedBy.id}:${slot.dishName}`}
            question={mine ? `Release '${slot.dishName}'?` : `Remove ${by}'s claim?`}
            buttonLabel={mine ? `Release your ${label} slot` : `Remove ${by}'s claim`}
            confirmLabel={mine ? 'Release' : 'Remove'}
            onConfirm={() => onRelease(slot)}
          />
        ) : null}
      </article>
    );
  }

  const showHint = hint !== undefined && openState === 'claimable';
  return (
    <button
      type="button"
      disabled={openState !== 'claimable' || pending}
      aria-label={`Claim open ${label} slot ${number}`}
      aria-describedby={showHint ? hintId : undefined}
      onClick={() => onClaim(slot)}
      className="flex min-h-24 cursor-pointer flex-col justify-between gap-s2 rounded-lg border-2 border-dashed border-border-ui bg-transparent px-s4 py-s3 text-left text-muted enabled:hover:border-primary enabled:hover:bg-surface enabled:hover:text-ink disabled:cursor-not-allowed disabled:opacity-55"
    >
      <span className="font-extrabold text-primary">{openLabel[openState]}</span>
      {showHint ? (
        <span
          id={hintId}
          className="self-start rounded-pill bg-warn-bg px-s2 py-[2px] text-xs font-bold text-warn-ink"
        >
          {hint}
        </span>
      ) : null}
      <span className="text-sm">Open {singular}</span>
    </button>
  );
}

/**
 * True from a slot getting a (new) claimant until its pop animation ends, so claims arriving live
 * pop (03-design.md › board › Interactions) but the board's first paint doesn't.
 */
function usePopOnClaim(claimantId: string | null) {
  const [active, setActive] = useState(false);
  const previous = useRef(claimantId);
  useEffect(() => {
    if (claimantId !== null && claimantId !== previous.current) setActive(true);
    previous.current = claimantId;
  }, [claimantId]);
  return { active, done: () => setActive(false) };
}

interface ReleaseControlProps {
  question: string;
  buttonLabel: string;
  confirmLabel: string;
  onConfirm: () => void;
}

/** The ✕ on a claimed card and its confirm popover (03-design.md › board › Interactions). */
function ReleaseControl({ question, buttonLabel, confirmLabel, onConfirm }: ReleaseControlProps) {
  const [open, setOpen] = useState(false);
  const questionId = useId();
  const trigger = useRef<HTMLButtonElement>(null);
  const confirm = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    if (open) confirm.current?.focus();
  }, [open]);

  const close = () => {
    setOpen(false);
    trigger.current?.focus();
  };

  return (
    <>
      <button
        ref={trigger}
        type="button"
        aria-label={buttonLabel}
        aria-expanded={open}
        onClick={() => setOpen((v) => !v)}
        className="absolute top-[6px] right-[6px] grid size-10 cursor-pointer place-items-center rounded-md text-lg font-bold text-primary after:absolute after:-inset-1 after:content-[''] hover:bg-surface-2"
      >
        <span aria-hidden="true">✕</span>
      </button>
      {open ? (
        <div
          role="dialog"
          aria-labelledby={questionId}
          onKeyDown={(e) => {
            if (e.key === 'Escape') {
              e.stopPropagation();
              close();
            }
          }}
          className="absolute top-12 right-0 z-10 flex w-max max-w-[260px] flex-col gap-s3 rounded-md border border-border bg-surface p-s4 shadow-e3"
        >
          <p id={questionId} className="text-sm font-bold">
            {question}
          </p>
          <div className="flex justify-end gap-s2">
            <Button variant="secondary" size="sm" onClick={close}>
              Cancel
            </Button>
            <Button
              ref={confirm}
              variant="danger"
              size="sm"
              onClick={() => {
                setOpen(false);
                onConfirm();
              }}
            >
              {confirmLabel}
            </Button>
          </div>
        </div>
      ) : null}
    </>
  );
}
