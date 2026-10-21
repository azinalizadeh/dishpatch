/** Two-letter initials: the first two words' initials, or the first two letters of one word. */
export function initials(name: string): string {
  const words = name.trim().split(/\s+/u).filter(Boolean);
  const [first = '', second = ''] = words;
  const letters =
    words.length > 1 ? `${[...first][0]}${[...second][0]}` : [...first].slice(0, 2).join('');
  return letters.toLocaleUpperCase();
}

/** Initials disc (design/mockup.html › .avatar); the host's is primary, guests' are accent. */
export function Avatar({
  name,
  host = false,
  size = 'md',
}: {
  name: string;
  host?: boolean;
  size?: 'sm' | 'md';
}) {
  return (
    <span
      aria-hidden="true"
      className={`inline-grid flex-none place-items-center rounded-full font-extrabold ${
        size === 'sm' ? 'size-6 text-[11px]' : 'size-8 text-[13px]'
      } ${host ? 'bg-primary text-on-primary' : 'bg-accent text-on-accent'}`}
    >
      {initials(name)}
    </span>
  );
}
