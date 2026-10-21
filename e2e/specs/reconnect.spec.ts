import { createBoard, guestList, joinBoard, newPerson, openLiveBoard } from '../board.ts';
import { expect, test } from '../fixtures.ts';

test.beforeEach(({ isMobile }) => {
  test.skip(isMobile, 'guest list is desktop-only');
});

// Claims arrive with F4 (M5); until then the missed board changes are guests joining, which
// travel through the same log, replay and apply path.
test('offline banner shows after dropping the network and missed claims appear after reconnect', async ({
  browser,
  page,
  context,
  baseURL,
}) => {
  const board = await createBoard(page.request, baseURL);
  await openLiveBoard(page, board.eventId);
  const open = page.getByRole('button', { name: 'Claim open Mains slot 1' });
  await expect(open).toBeEnabled();

  await context.setOffline(true);
  await expect(page.getByText(/Connection lost\. Reconnecting…/)).toBeVisible({ timeout: 10_000 });
  await expect(page.getByText(/^Reconnecting…$/)).toBeVisible();
  await expect(open).toBeDisabled();
  await expect(open).toContainText('Paused');

  // Changes made while this device is offline.
  const other = await newPerson(browser);
  await joinBoard(other.page.request, baseURL, board.invitePath, 'Reza');
  await joinBoard(other.page.request, baseURL, board.invitePath, 'Leila');
  await other.context.close();

  await context.setOffline(false);
  // EventSource retries every 3 s and replays from its Last-Event-ID.
  await expect(page.getByText(/^Live/)).toBeVisible({
    timeout: 15_000,
  });
  await expect(page.getByText(/Connection lost/)).toBeHidden();
  await expect(guestList(page).getByText('Reza', { exact: true })).toBeVisible();
  await expect(guestList(page).getByText('Leila', { exact: true })).toBeVisible();
  await expect(open).toBeEnabled();
});
