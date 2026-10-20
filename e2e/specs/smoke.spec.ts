import { expect, test } from '@playwright/test';

test('loads / and shows the Dishpatch title', async ({ page }) => {
  const errors: string[] = [];
  page.on('console', (msg) => {
    if (msg.type() === 'error') errors.push(msg.text());
  });

  await page.goto('/');
  await expect(page).toHaveTitle(/Dishpatch/);
  await expect(page.getByRole('heading', { level: 1 })).toBeVisible();
  // A CSP violation (inline script/style, data: fonts) would surface as a console error.
  expect(errors).toEqual([]);
});
