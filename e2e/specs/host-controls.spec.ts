import { createBoard, joinBoard, newPerson, openLiveBoard } from '../board.ts';
import { expect, test } from '../fixtures.ts';

const TITLE = "Friendsgiving at Mina's";

/** The host (`page`, holding the session from create) and one guest on another device. */
async function hostAndGuest({
  browser,
  page,
  baseURL,
}: {
  browser: import('@playwright/test').Browser;
  page: import('@playwright/test').Page;
  baseURL: string | undefined;
}) {
  const board = await createBoard(page.request, baseURL);
  const guest = await newPerson(browser);
  await joinBoard(guest.page.request, baseURL, board.invitePath, 'Priya');
  return { board, guest };
}

test('locking in the host context shows the locked banner in the guest context', async ({
  browser,
  page,
  baseURL,
}) => {
  const { board, guest } = await hostAndGuest({ browser, page, baseURL });
  await openLiveBoard(guest.page, board.eventId);
  await expect(guest.page.getByRole('button', { name: 'Claim open Mains slot 1' })).toBeEnabled();

  await page.goto(`/events/${board.eventId}`);
  await page.getByRole('link', { name: 'Host settings' }).click();
  await expect(page.getByRole('heading', { name: 'Host settings' })).toBeVisible();
  await expect(page.getByText(/^Live/)).toBeVisible();
  const lock = page.getByRole('switch', { name: 'Lock the board' });
  await lock.click();
  await expect(lock).toHaveAttribute('aria-checked', 'true');
  await expect(page.getByText('Board locked')).toBeVisible();

  await expect(guest.page.getByText('Mina locked the board.')).toBeVisible();
  const closed = guest.page.getByRole('button', { name: 'Claim open Mains slot 1' });
  await expect(closed).toBeDisabled();
  await expect(closed).toContainText('Closed');

  await lock.click();
  await expect(guest.page.getByText('Mina locked the board.')).toBeHidden();
  await expect(guest.page.getByRole('button', { name: 'Claim open Mains slot 1' })).toBeEnabled();
  await guest.context.close();
});

test('old invite link shows the join error after rotation', async ({ browser, page, baseURL }) => {
  const { board, guest } = await hostAndGuest({ browser, page, baseURL });

  await page.goto(`/events/${board.eventId}/host`);
  await page.getByRole('button', { name: 'New link' }).click();
  await expect(page.getByText('New invite link ready')).toBeVisible();
  await expect(page.getByRole('group', { name: 'New invite link' })).toBeVisible();

  // Someone new with the old link gets the join error.
  const stranger = await newPerson(browser);
  await stranger.page.goto(board.invitePath);
  await expect(
    stranger.page.getByRole('heading', { name: "This invite link doesn't work anymore" }),
  ).toBeVisible();
  await stranger.context.close();

  // Priya, who joined before the rotation, still has the board.
  await openLiveBoard(guest.page, board.eventId);
  await expect(guest.page.getByRole('heading', { name: TITLE })).toBeVisible();
  await guest.context.close();
});

test('deleting the board sends a connected guest to notfound', async ({
  browser,
  page,
  baseURL,
}) => {
  const { board, guest } = await hostAndGuest({ browser, page, baseURL });
  await openLiveBoard(guest.page, board.eventId);

  await page.goto(`/events/${board.eventId}/host`);
  await page.getByRole('button', { name: 'Delete board' }).click();
  const dialog = page.getByRole('alertdialog', { name: `Delete “${TITLE}”?` });
  const confirm = dialog.getByRole('button', { name: 'Delete for everyone' });
  await expect(confirm).toBeDisabled();
  await dialog.getByLabel('Event name').fill(TITLE);
  await confirm.click();

  await expect(page).toHaveURL(/\/$/);
  await expect(page.getByText('Board deleted')).toBeVisible();
  await expect(guest.page.getByRole('heading', { name: 'Nothing on this plate' })).toBeVisible();

  // The board is gone for good, the host's session included.
  const res = await page.request.get(`/api/events/${board.eventId}`);
  expect(res.status()).toBe(404);
  await guest.context.close();
});
