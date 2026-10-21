/** "Sat, 21 Nov 2026 · 18:00" in the viewer's locale; `withYear: false` drops the year. */
export function formatWhen(iso: string, { withYear = true } = {}): string {
  const date = new Date(iso);
  const day = new Intl.DateTimeFormat(undefined, {
    weekday: 'short',
    day: 'numeric',
    month: 'short',
    ...(withYear ? { year: 'numeric' } : {}),
  }).format(date);
  const time = new Intl.DateTimeFormat(undefined, { hour: '2-digit', minute: '2-digit' }).format(
    date,
  );
  return `${day} · ${time}`;
}
