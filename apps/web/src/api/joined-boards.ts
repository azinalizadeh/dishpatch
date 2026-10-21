// Which board this browser joined from an invite link, so a second visit skips the form
// (01-product.md › US-03). The session cookie itself is HttpOnly and path-scoped, so the page
// can't see it; we keep only SHA-256(invite token) → eventId, never the raw token (07-security.md › I2).
const KEY = 'dp_joined';

/** null when SubtleCrypto is missing (plain-HTTP origins other than localhost): we then just don't remember. */
async function inviteKey(inviteToken: string): Promise<string | null> {
  try {
    const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(inviteToken));
    return Array.from(new Uint8Array(digest), (b) => b.toString(16).padStart(2, '0')).join('');
  } catch {
    return null;
  }
}

function read(): Record<string, string> {
  try {
    const parsed: unknown = JSON.parse(localStorage.getItem(KEY) ?? '{}');
    return parsed && typeof parsed === 'object' ? (parsed as Record<string, string>) : {};
  } catch {
    return {};
  }
}

function write(map: Record<string, string>) {
  try {
    localStorage.setItem(KEY, JSON.stringify(map));
  } catch {
    // Storage blocked or full: the next visit just shows the form again.
  }
}

// None of these throw: remembering is a convenience, never a reason to fail a join.
export async function joinedEventFor(inviteToken: string): Promise<string | null> {
  const key = await inviteKey(inviteToken);
  return key ? (read()[key] ?? null) : null;
}

export async function rememberJoin(inviteToken: string, eventId: string): Promise<void> {
  const key = await inviteKey(inviteToken);
  if (key) write({ ...read(), [key]: eventId });
}

export async function forgetJoin(inviteToken: string): Promise<void> {
  const key = await inviteKey(inviteToken);
  if (!key) return;
  const map = read();
  delete map[key];
  write(map);
}
