import { DIETARY_LABELS, type SlotView } from '@dishpatch/shared';
import { CATEGORY_LABELS } from '../categories.ts';
import { Avatar } from './Avatar.tsx';
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
  onClaim: (slot: SlotView) => void;
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
export function SlotCard({ slot, number, mine, hostId, openState, onClaim }: SlotCardProps) {
  const { plural: label, singular, border } = CATEGORY_LABELS[slot.category];

  if (slot.claimedBy && slot.dishName) {
    const by = slot.claimedBy.displayName;
    return (
      <article
        aria-label={`${label} slot ${number}: ${slot.dishName}, brought by ${by}`}
        className={`slot-sticker relative flex min-h-24 flex-col justify-between gap-s2 rounded-lg border border-l-8 border-border bg-surface px-s4 py-s3 shadow-e2 ${border} ${
          mine ? 'outline-2 outline-offset-2 outline-primary' : ''
        }`}
      >
        <span className="text-[17px] leading-[1.25] font-bold">{slot.dishName}</span>
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
      </article>
    );
  }

  return (
    <button
      type="button"
      disabled={openState !== 'claimable'}
      aria-label={`Claim open ${label} slot ${number}`}
      onClick={() => onClaim(slot)}
      className="flex min-h-24 cursor-pointer flex-col justify-between gap-s2 rounded-lg border-2 border-dashed border-border-ui bg-transparent px-s4 py-s3 text-left text-muted enabled:hover:border-primary enabled:hover:bg-surface enabled:hover:text-ink disabled:cursor-not-allowed disabled:opacity-55"
    >
      <span className="font-extrabold text-primary">{openLabel[openState]}</span>
      <span className="text-sm">Open {singular}</span>
    </button>
  );
}
