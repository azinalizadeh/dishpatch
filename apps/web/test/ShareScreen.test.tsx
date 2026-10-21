import { cleanup, fireEvent, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { forgetCreatedBoard, rememberCreatedBoard } from '../src/api/created-board.ts';
import { renderRoutes } from './render-routes.tsx';

const eventId = '0b5a4c1e-8a57-4d4b-9f4c-2f1b8e7a9c11';
const inviteUrl = 'http://localhost:5173/e/q8Zp2vN7aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaakT4w';
const hostUrl = 'http://localhost:5173/h/Wm3sQe9Lbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb';

function renderShare() {
  rememberCreatedBoard(
    {
      title: "Friendsgiving at Mina's",
      startsAt: '2026-11-21T17:00:00.000Z',
      hostName: 'Mina',
      hostDietaryNeeds: [],
      slots: [
        { category: 'main', count: 3 },
        { category: 'side', count: 3 },
        { category: 'salad', count: 2 },
        { category: 'dessert', count: 2 },
        { category: 'drinks', count: 2 },
      ],
    },
    { eventId, inviteUrl, hostUrl },
  );
  return renderRoutes(`/events/${eventId}/share`);
}

function stubClipboard(writeText: (text: string) => Promise<void>) {
  const clipboard = { writeText: vi.fn(writeText) };
  Object.defineProperty(navigator, 'clipboard', { value: clipboard, configurable: true });
  return clipboard;
}

describe('ShareScreen', () => {
  beforeEach(() => forgetCreatedBoard());
  afterEach(() => cleanup());

  it('shows the board, both links, the private-link warning and 12 slots', () => {
    renderShare();
    expect(screen.getByRole('heading', { level: 1, name: "Friendsgiving at Mina's" })).toBeTruthy();
    expect(screen.getByText(/12 slots/)).toBeTruthy();
    const invite = screen.getByRole('group', {
      name: 'Guest invite link — send this to the group',
    });
    expect(invite.querySelector('code')?.textContent).toBe('localhost:5173/e/q8Zp2vN7…kT4w');
    const host = screen.getByRole('group', { name: 'Your host link — keep this private' });
    expect(host.querySelector('code')?.textContent).toBe('localhost:5173/h/Wm3sQe9L…bbbb');
    expect(screen.getByText(/We can't show the host link again/)).toBeTruthy();
    expect(screen.getByRole('link', { name: 'Go to the board' }).getAttribute('href')).toBe(
      `/events/${eventId}`,
    );
  });

  it('copy writes the invite link and shows a toast', async () => {
    const clipboard = stubClipboard(async () => {});
    renderShare();

    fireEvent.click(screen.getByRole('button', { name: 'Copy invite link' }));

    await waitFor(() => expect(screen.getByRole('status').textContent).toBe('Invite link copied'));
    expect(clipboard.writeText).toHaveBeenCalledWith(inviteUrl);
  });

  it('falls back to selecting the text when clipboard is denied', async () => {
    stubClipboard(async () => {
      throw new DOMException('Denied', 'NotAllowedError');
    });
    renderShare();

    fireEvent.click(screen.getByRole('button', { name: 'Copy host link' }));

    await waitFor(() =>
      expect(screen.getByRole('status').textContent).toBe('Press Ctrl/⌘+C to copy'),
    );
    expect(window.getSelection()?.toString()).toBe(hostUrl);
  });

  it('warns before unload until the host link is copied, and never stores it', async () => {
    stubClipboard(async () => {});
    renderShare();
    const before = new Event('beforeunload', { cancelable: true });
    window.dispatchEvent(before);
    expect(before.defaultPrevented).toBe(true);

    fireEvent.click(screen.getByRole('button', { name: 'Copy host link' }));
    await waitFor(() => expect(screen.getByRole('status').textContent).toBe('Host link copied'));
    const after = new Event('beforeunload', { cancelable: true });
    window.dispatchEvent(after);
    expect(after.defaultPrevented).toBe(false);

    const stored = JSON.stringify({ ...localStorage, ...sessionStorage, state: history.state });
    expect(stored).not.toContain('Wm3sQe9L');
  });
});
