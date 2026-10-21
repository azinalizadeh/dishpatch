import type { Connection } from '../api/use-board-stream.ts';

/**
 * Top-bar status (03-design.md › board): "Live · 6 here" with a green dot, or a red
 * "Reconnecting…". A polite status region, so changes are read out without stealing focus.
 */
export function ConnectionIndicator({
  connection,
  presence,
}: {
  connection: Connection;
  presence: number | null;
}) {
  if (connection === 'notfound') return null;
  let label = 'Connecting…';
  if (connection === 'reconnecting') label = 'Reconnecting…';
  else if (connection === 'live') label = presence === null ? 'Live' : `Live · ${presence} here`;
  return (
    <p role="status" className="inline-flex items-center gap-s2 text-sm font-bold text-muted">
      <i
        aria-hidden="true"
        className={`conn-dot ${connection === 'reconnecting' ? 'conn-dot-off' : ''}`}
      />
      <span>{label}</span>
    </p>
  );
}
