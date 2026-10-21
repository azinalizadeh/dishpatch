import type { APIRequestContext } from '@playwright/test';
import { expect, test } from '../fixtures.ts';

const DAY_MS = 24 * 60 * 60 * 1000;

/** Creates a board through the public API and returns its invite path and token. */
async function createBoard(request: APIRequestContext, origin: string) {
  const res = await request.post('/api/events', {
    headers: { Origin: origin },
    data: {
      title: "Friendsgiving at Mina's",
      startsAt: new Date(Date.now() + 30 * DAY_MS).toISOString(),
      location: "Mina's flat, 3rd floor",
      hostName: 'Mina',
      hostDietaryNeeds: [],
      slots: [{ category: 'main', count: 3 }],
    },
  });
  expect(res.status()).toBe(201);
  const { eventId, inviteUrl } = (await res.json()) as { eventId: string; inviteUrl: string };
  const invitePath = new URL(inviteUrl).pathname;
  return { eventId, invitePath, inviteToken: invitePath.split('/').pop() ?? 'missing' };
}

const originOf = (baseURL: string | undefined) =>
  new URL(baseURL ?? 'http://localhost:3000').origin;

test('guest joins from invite link and sees the board', async ({ page, request, baseURL }) => {
  const board = await createBoard(request, originOf(baseURL));

  await page.goto(board.invitePath);
  await expect(page.getByText('Mina invited you to')).toBeVisible();
  await expect(page.getByText('1 going')).toBeVisible();
  await page.getByLabel('Your name').fill('Priya');
  await page.getByRole('button', { name: 'Vegan' }).click();
  await expect(page.getByRole('button', { name: /Vegan/ })).toHaveAttribute('aria-pressed', 'true');
  await page.getByRole('button', { name: 'Join the board' }).click();

  await expect(page).toHaveURL(new RegExp(`/events/${board.eventId}$`));
  await expect(
    page.getByRole('heading', { level: 1, name: "Friendsgiving at Mina's" }),
  ).toBeVisible();
  await expect(page.getByRole('listitem').filter({ hasText: 'Priya' })).toContainText('(you)');

  // Same browser opening the invite again goes straight to the board, without a second guest.
  await page.goto(board.invitePath);
  await expect(page).toHaveURL(new RegExp(`/events/${board.eventId}$`));
  await expect(page.getByRole('listitem')).toHaveCount(2);
});

test('address bar no longer contains the invite token after joining', async ({
  page,
  request,
  baseURL,
}) => {
  const board = await createBoard(request, originOf(baseURL));

  await page.goto(board.invitePath);
  await page.getByLabel('Your name').fill('Sam');
  await page.getByRole('button', { name: 'Join the board' }).click();
  await expect(page).toHaveURL(new RegExp(`/events/${board.eventId}$`));

  const persisted = await page.evaluate(() =>
    JSON.stringify({
      url: location.href,
      state: history.state,
      local: { ...localStorage },
      session: { ...sessionStorage },
    }),
  );
  expect(persisted).not.toContain(board.inviteToken);
  // The join replaced the invite entry, so Back can't return to the token URL.
  await page.goBack();
  expect(page.url()).not.toContain(board.inviteToken);
});

test('a taken name shows an inline error and keeps the form', async ({
  page,
  request,
  baseURL,
}) => {
  const board = await createBoard(request, originOf(baseURL));

  await page.goto(board.invitePath);
  await page.getByLabel('Your name').fill('mina');
  await page.getByRole('button', { name: 'Join the board' }).click();

  await expect(
    page.getByText('Someone called Mina is already here — add an initial?'),
  ).toBeVisible();
  await expect(page.getByLabel('Your name')).toHaveValue('mina');
  expect(page.url()).toContain(board.invitePath);
});

test('rotated or bogus link shows "This invite link doesn\'t work anymore"', async ({ page }) => {
  await page.goto(`/e/${'x'.repeat(43)}`);
  await expect(page.getByRole('alert')).toContainText("This invite link doesn't work anymore");
  await expect(page.getByRole('link', { name: 'Start your own board' })).toBeVisible();

  await page.goto('/e/not-even-a-token');
  await expect(page.getByRole('alert')).toContainText("This invite link doesn't work anymore");
});
