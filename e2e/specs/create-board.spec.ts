import { expect, test } from '@playwright/test';

const DAY_MS = 24 * 60 * 60 * 1000;

/** A `datetime-local` value a month from now. */
function nextMonthLocal(): string {
  const d = new Date(Date.now() + 30 * DAY_MS);
  d.setHours(18, 0, 0, 0);
  return new Date(d.getTime() - d.getTimezoneOffset() * 60_000).toISOString().slice(0, 16);
}

test('host creates a board and reaches the share screen in under 10 s', async ({ page }) => {
  const started = Date.now();
  await page.goto('/');
  await page.getByLabel('Event name').fill("Friendsgiving at Mina's");
  await page.getByLabel('Date & time').fill(nextMonthLocal());
  await page.getByLabel('Where').fill("Mina's flat, 3rd floor");
  await page.getByLabel('Your name').fill('Mina');
  await page.getByRole('button', { name: 'Create board' }).click();

  await expect(page).toHaveURL(/\/events\/[0-9a-f-]{36}\/share$/);
  await expect(
    page.getByRole('heading', { level: 1, name: "Friendsgiving at Mina's" }),
  ).toBeVisible();
  expect(Date.now() - started).toBeLessThan(10_000);

  const invite = page.getByRole('group', { name: /Guest invite link/ }).locator('code');
  const host = page.getByRole('group', { name: /Your host link/ }).locator('code');
  await expect(invite).toHaveText(/\/e\/[A-Za-z0-9_-]{43}$/);
  await expect(host).toHaveText(/\/h\/[A-Za-z0-9_-]{43}$/);
  await expect(page.getByText('12 slots', { exact: false })).toBeVisible();

  // The raw tokens live only in this screen's memory: not in storage, history state or the URL.
  const tokens = [await invite.textContent(), await host.textContent()].map(
    (url) => url?.split('/').pop() ?? 'missing',
  );
  const persisted = await page.evaluate(() =>
    JSON.stringify({
      local: { ...localStorage },
      session: { ...sessionStorage },
      state: history.state,
      url: location.href,
    }),
  );
  for (const token of tokens) expect(persisted).not.toContain(token);

  await page.getByRole('link', { name: 'Go to the board' }).click();
  await expect(page).toHaveURL(/\/events\/[0-9a-f-]{36}$/);
});

test('host link opened in a new context lands on the board as host and the URL has no token', async ({
  browser,
  request,
  baseURL,
}) => {
  const res = await request.post('/api/events', {
    headers: { Origin: new URL(baseURL ?? 'http://localhost:3000').origin },
    data: {
      title: "Friendsgiving at Mina's",
      startsAt: new Date(Date.now() + 30 * DAY_MS).toISOString(),
      hostName: 'Mina',
      hostDietaryNeeds: [],
      slots: [{ category: 'main', count: 3 }],
    },
  });
  expect(res.status()).toBe(201);
  const { eventId, hostUrl } = (await res.json()) as { eventId: string; hostUrl: string };
  const hostToken = new URL(hostUrl).pathname.split('/').pop() ?? 'missing';

  const phone = await browser.newContext();
  const page = await phone.newPage();
  await page.goto(new URL(hostUrl).pathname);

  await expect(page).toHaveURL(new RegExp(`/events/${eventId}$`));
  expect(page.url()).not.toContain(hostToken);
  await expect(page.getByRole('heading', { level: 1 })).toBeVisible();

  // Signed in as the host of that board: an HttpOnly session cookie scoped to the event's API path.
  const cookies = await phone.cookies();
  expect(cookies).toEqual([
    expect.objectContaining({
      name: 'dp_sess',
      path: `/api/events/${eventId}`,
      httpOnly: true,
      sameSite: 'Strict',
    }),
  ]);
  await phone.close();
});

test('a wrong host link shows the not-found screen', async ({ page }) => {
  await page.goto(`/h/${'x'.repeat(43)}`);
  await expect(
    page.getByRole('heading', { level: 1, name: 'Nothing on this plate' }),
  ).toBeVisible();
  await expect(page.getByRole('link', { name: 'Start a new board' })).toBeVisible();
});
