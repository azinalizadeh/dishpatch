import type { Connection } from '../api/use-board-stream.ts';

const dotState: Record<Exclude<Connection, 'notfound'>, string> = {
  connecting: 'conn-dot-wait',
  live: '',
  reconnecting: 'conn-dot-off',
};

/**
 * Top-bar status (03-design.md › board): "Live · 6 here" with a green dot, or a red
 * "Reconnecting…". Not a live region: the board has one polite region (throttled) and the
 * offline banner is a status, so presence ticks don't add screen-reader chatter.
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
    <p className="inline-flex items-center gap-s2 text-sm font-bold text-muted">
      <i aria-hidden="true" className={`conn-dot ${dotState[connection]}`} />
      <span>{label}</span>
    </p>
  );
}
