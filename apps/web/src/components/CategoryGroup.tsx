import type { Category, SlotView } from '@dishpatch/shared';
import { CATEGORY_LABELS } from '../categories.ts';
import { Skeleton } from './Skeleton.tsx';
import { type OpenSlotState, SlotCard } from './SlotCard.tsx';

interface CategoryGroupProps {
  category: Category;
  slots: SlotView[];
  meId: string;
  hostId: string | undefined;
  openState: OpenSlotState;
  /** Releases are allowed (not offline, not locked); who may release is decided per card. */
  releasable: boolean;
  isHost: boolean;
  onClaim: (slot: SlotView) => void;
  onRelease: (slot: SlotView) => void;
  pendingSlotIds: ReadonlySet<string>;
}

const slotGrid = 'grid grid-cols-2 gap-s3 tablet:grid-cols-3';

/** A `<section aria-label="Mains">` with its "2/3" count and its slots (03-design.md › board). */
export function CategoryGroup({
  category,
  slots,
  meId,
  hostId,
  openState,
  releasable,
  isHost,
  onClaim,
  onRelease,
  pendingSlotIds,
}: CategoryGroupProps) {
  const { plural, dot } = CATEGORY_LABELS[category];
  const claimed = slots.filter((s) => s.claimedBy).length;
  return (
    <section aria-label={plural}>
      <h2 className="mb-s3 flex items-center gap-s2 text-lg leading-[1.3]">
        <span aria-hidden="true" className={`size-3 rounded-[4px] ${dot}`} />
        {plural}
        <span className="font-sans text-sm font-semibold text-muted">
          {claimed}/{slots.length}
        </span>
      </h2>
      <div className={slotGrid}>
        {slots.map((slot, i) => {
          const mine = slot.claimedBy?.id === meId;
          return (
            <SlotCard
              key={slot.id}
              slot={slot}
              number={i + 1}
              mine={mine}
              hostId={hostId}
              openState={openState}
              canRelease={releasable && (mine || isHost)}
              pending={pendingSlotIds.has(slot.id)}
              onClaim={onClaim}
              onRelease={onRelease}
            />
          );
        })}
      </div>
    </section>
  );
}

/** Loading stand-in for a group: the heading shape and three skeleton slots. */
export function CategoryGroupSkeleton() {
  return (
    <div aria-hidden="true">
      <Skeleton className="mb-s3 h-6 w-32 rounded-md" />
      <div className={slotGrid}>
        <Skeleton className="h-24 rounded-lg" />
        <Skeleton className="h-24 rounded-lg" />
        <Skeleton className="h-24 rounded-lg" />
      </div>
    </div>
  );
}
