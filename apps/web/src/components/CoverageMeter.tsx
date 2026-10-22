import { type CoverageStatus, DIETARY_LABELS, type NeedCoverage } from '@dishpatch/shared';
import { countsText, statusText } from '../coverage-copy.ts';
import { Banner } from './Banner.tsx';
import { Skeleton } from './Skeleton.tsx';

const pill: Record<CoverageStatus, string> = {
  ok: 'bg-ok-bg text-ok-ink',
  thin: 'bg-warn-bg text-warn-ink',
  gap: 'bg-err-bg text-err-ink',
};

/** 03-design.md › coverage: width = min(100, dishes × 25)%, with a sliver for zero. */
const WIDTHS = ['w-[4%]', 'w-1/4', 'w-1/2', 'w-3/4', 'w-full'] as const;

const bar: Record<CoverageStatus, string> = {
  ok: 'bg-primary',
  thin: 'bg-accent',
  gap: 'bg-error',
};

interface CoverageMeterProps {
  coverage: readonly NeedCoverage[] | undefined;
  /** compact: the board's sidebar card; full: the coverage screen. */
  variant: 'compact' | 'full';
}

/**
 * Dietary coverage per need (03-design.md › CoverageMeter). The status is always written out, so
 * colour is never the only signal; the bar is an image with its own label.
 */
export function CoverageMeter({ coverage, variant }: CoverageMeterProps) {
  if (coverage === undefined) {
    return (
      <div role="status" aria-label="Loading dietary coverage" className="flex flex-col gap-s4">
        <Skeleton className="h-12 rounded-md" />
        <Skeleton className="h-12 rounded-md" />
        <Skeleton className="h-12 rounded-md" />
      </div>
    );
  }

  if (coverage.length === 0) {
    return variant === 'full' ? (
      <Banner tone="ok" icon="✓">
        No one has listed dietary needs yet. Coverage appears here when guests join with needs.
      </Banner>
    ) : (
      <p className="text-sm text-muted">No one has listed dietary needs yet.</p>
    );
  }

  return (
    <ul aria-label="Dietary needs" className="flex flex-col gap-s4">
      {coverage.map((row) => {
        const name = DIETARY_LABELS[row.need];
        const width = WIDTHS[Math.min(row.dishes, WIDTHS.length - 1)];
        return (
          <li key={row.need} className="flex flex-col gap-s2">
            <div className="flex items-center justify-between gap-s3">
              <div className="flex min-w-0 flex-col">
                <span className="font-bold">{name}</span>
                <span className="text-sm text-muted">{countsText(row)}</span>
              </div>
              <span
                className={`shrink-0 rounded-pill px-s2 py-[2px] text-xs font-bold ${pill[row.status]}`}
              >
                {statusText(row)}
              </span>
            </div>
            <span
              role="img"
              aria-label={`${name}: ${row.dishes} compatible ${row.dishes === 1 ? 'dish' : 'dishes'}`}
              className="block h-2 overflow-hidden rounded-pill bg-surface-2"
            >
              <span className={`block h-full rounded-pill ${width} ${bar[row.status]}`} />
            </span>
          </li>
        );
      })}
    </ul>
  );
}
