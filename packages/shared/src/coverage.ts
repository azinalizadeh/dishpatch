import { DIETARY, type Dietary } from './dietary.ts';
import type { NeedCoverageView, SlotView } from './schemas.ts';

/** One need on the board: its guests, the claimed dishes that suit it, how many are mains. */
export type NeedCoverage = NeedCoverageView;

export type CoverageStatus = NeedCoverage['status'];

export interface CoverageHint {
  need: Dietary;
  /** Which open slots the hint goes on: mains only (thin) or any open slot (gap). */
  categories: 'main' | 'any';
}

/** One step better for one need, as the claim dialog previews it. */
export interface CoverageChange {
  need: Dietary;
  guests: number;
  from: CoverageStatus;
  to: CoverageStatus;
  /** Compatible mains before the draft: 0 means the draft closes a main gap. */
  mainsBefore: number;
}

type Participant = { dietaryNeeds: readonly Dietary[] };
type Slot = Pick<SlotView, 'id' | 'category' | 'claimedBy' | 'dishTags'>;

const STATUS_ORDER: Record<CoverageStatus, number> = { gap: 0, thin: 1, ok: 2 };

/** What a dish is suitable for once implied tags are added: vegan ⇒ vegetarian + dairy-free. */
export function effectiveTags(tags: readonly Dietary[]): Set<Dietary> {
  const result = new Set(tags);
  if (result.has('vegan')) {
    result.add('vegetarian');
    result.add('dairy_free');
  }
  return result;
}

function statusOf(dishes: number, mains: number): CoverageStatus {
  if (dishes === 0) return 'gap';
  if (mains === 0 || dishes === 1) return 'thin';
  return 'ok';
}

/**
 * Coverage per dietary need on a board (04-architecture.md › coverage rule). Needs nobody has are
 * left out. Sorted gap → thin → ok, then by guests, most first. Used by the API snapshot and the
 * web app, so both always agree.
 */
export function computeCoverage(
  participants: readonly Participant[],
  slots: readonly Slot[],
): NeedCoverage[] {
  const claimed = slots
    .filter((slot) => slot.claimedBy !== null)
    .map((slot) => ({ isMain: slot.category === 'main', tags: effectiveTags(slot.dishTags) }));

  const result: NeedCoverage[] = [];
  for (const need of DIETARY) {
    const guests = participants.filter((p) => p.dietaryNeeds.includes(need)).length;
    if (guests === 0) continue;
    const fitting = claimed.filter((dish) => dish.tags.has(need));
    const dishes = fitting.length;
    const mains = fitting.filter((dish) => dish.isMain).length;
    result.push({ need, guests, dishes, mains, status: statusOf(dishes, mains) });
  }
  return result.sort(
    (a, b) => STATUS_ORDER[a.status] - STATUS_ORDER[b.status] || b.guests - a.guests,
  );
}

/**
 * The one need worth nudging people about: the uncovered need with the most guests (a gap wins a
 * tie). Thin with no compatible main needs a main; a gap, or thin with one dish that is already a
 * main, takes any dish. Null when every need is covered.
 */
export function topHint(coverage: readonly NeedCoverage[]): CoverageHint | null {
  let top: NeedCoverage | null = null;
  for (const row of coverage) {
    if (row.status === 'ok') continue;
    if (top === null || row.guests > top.guests) top = row;
  }
  if (top === null) return null;
  return { need: top.need, categories: top.status === 'thin' && top.mains === 0 ? 'main' : 'any' };
}

/**
 * How coverage would change if the draft claim went through: every need whose status gets better,
 * most guests first. The claim dialog turns the first one into its preview banner.
 */
export function previewCoverage(
  current: { participants: readonly Participant[]; slots: readonly Slot[] },
  draft: { slotId: string; dishTags: readonly Dietary[] },
): CoverageChange[] {
  const before = computeCoverage(current.participants, current.slots);
  const after = computeCoverage(
    current.participants,
    current.slots.map((slot) =>
      slot.id === draft.slotId
        ? { ...slot, claimedBy: { id: 'draft', displayName: '' }, dishTags: [...draft.dishTags] }
        : slot,
    ),
  );
  // Same participants, so both lists hold the same needs.
  const afterByNeed = new Map(after.map((row) => [row.need, row] as const));
  const changes: CoverageChange[] = [];
  for (const was of before) {
    const now = afterByNeed.get(was.need) as NeedCoverage;
    if (STATUS_ORDER[now.status] > STATUS_ORDER[was.status]) {
      changes.push({
        need: was.need,
        guests: was.guests,
        from: was.status,
        to: now.status,
        mainsBefore: was.mains,
      });
    }
  }
  return changes.sort((a, b) => b.guests - a.guests);
}
