import {
  type CoverageChange,
  DIETARY_LABELS,
  type Dietary,
  type NeedCoverage,
} from '@dishpatch/shared';

const lower = (need: Dietary) => DIETARY_LABELS[need].toLowerCase();

/** The status pill (03-design.md › coverage): "Covered", "No vegan main yet", "Nothing yet". */
export function statusText(row: NeedCoverage): string {
  if (row.status === 'ok') return 'Covered';
  if (row.status === 'gap') return 'Nothing yet';
  return row.mains === 0 ? `No ${lower(row.need)} main yet` : 'Just one dish so far';
}

/** "2 guests need it · 2 dishes fit" */
export function countsText(row: NeedCoverage): string {
  const guests = row.guests === 1 ? '1 guest needs it' : `${row.guests} guests need it`;
  const dishes = row.dishes === 1 ? '1 dish fits' : `${row.dishes} dishes fit`;
  return `${guests} · ${dishes}`;
}

/**
 * The mobile banner's summary of what's missing, most guests first: "No vegan main yet ·
 * nut-free: nothing yet". Null when every need is covered.
 */
export function coverageSummary(coverage: readonly NeedCoverage[]): string | null {
  const open = coverage.filter((row) => row.status !== 'ok');
  if (open.length === 0) return null;
  return [...open]
    .sort((a, b) => b.guests - a.guests)
    .map((row) =>
      row.status === 'thin' && row.mains === 0
        ? statusText(row)
        : `${lower(row.need)}: ${statusText(row).toLowerCase()}`,
    )
    .map((text, i) => (i === 0 ? text.charAt(0).toUpperCase() + text.slice(1) : text))
    .join(' · ');
}

/** The claim dialog's preview banner: "This covers the vegan main gap for 2 guests." */
export function previewText(change: CoverageChange): string {
  const guests = change.guests === 1 ? '1 guest' : `${change.guests} guests`;
  const need = lower(change.need);
  if (change.to === 'thin') return `This is the first ${need} dish, for ${guests}.`;
  if (change.from === 'thin' && change.mainsBefore === 0)
    return `This covers the ${need} main gap for ${guests}.`;
  return `This covers ${need} for ${guests}.`;
}
