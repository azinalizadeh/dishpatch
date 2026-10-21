import AxeBuilder from '@axe-core/playwright';
import type { Page } from '@playwright/test';
import { expect, test } from '../fixtures.ts';

// 06-test-plan.md › a11y.spec.ts. Screens are added milestone by milestone (M2: create, share, notfound; M3: join; M4: board).
const TAGS = ['wcag2a', 'wcag2aa', 'wcag21aa', 'wcag22aa'];

async function expectNoSeriousViolations(page: Page) {
  const { violations } = await new AxeBuilder({ page }).withTags(TAGS).analyze();
  const serious = violations
    .filter((v) => v.impact === 'serious' || v.impact === 'critical')
    .map((v) => `${v.id}: ${v.nodes.map((n) => n.target.join(' ')).join(', ')}`);
  expect(serious).toEqual([]);
}

async function fillCreateForm(page: Page) {
  await page.getByLabel('Event name').fill("Friendsgiving at Mina's");
  await page.getByLabel('Date & time').fill('2099-11-21T18:00');
  await page.getByLabel('Your name').fill('Mina');
}

test.describe('accessibility', () => {
  for (const scheme of ['light', 'dark'] as const) {
    test.describe(scheme, () => {
      test.use({ colorScheme: scheme });

      test('create, create error, share and notfound have no serious violations', async ({
        page,
      }) => {
        await page.goto('/');
        await expectNoSeriousViolations(page);

        await page.getByRole('button', { name: 'Create board' }).click();
        await expect(page.getByRole('alert')).toBeFocused();
        await expectNoSeriousViolations(page);

        await fillCreateForm(page);
        await page.getByRole('button', { name: 'Create board' }).click();
        await expect(page.getByText('Board created')).toBeVisible();
        await expectNoSeriousViolations(page);

        await page.goto('/no/such/page');
        await expect(page.getByRole('heading', { name: 'Nothing on this plate' })).toBeFocused();
        await expectNoSeriousViolations(page);
      });

      test('join, join name-taken and join error have no serious violations', async ({
        page,
        baseURL,
      }) => {
        const res = await page.request.post('/api/events', {
          headers: { Origin: new URL(baseURL ?? 'http://localhost:3000').origin },
          data: {
            title: "Friendsgiving at Mina's",
            startsAt: '2099-11-21T18:00:00.000Z',
            hostName: 'Mina',
            hostDietaryNeeds: [],
            slots: [{ category: 'main', count: 3 }],
          },
        });
        const { inviteUrl } = (await res.json()) as { inviteUrl: string };

        await page.goto(new URL(inviteUrl).pathname);
        await page.getByRole('button', { name: 'Vegan' }).click();
        await expectNoSeriousViolations(page);

        await page.getByLabel('Your name').fill('Mina');
        await page.getByRole('button', { name: 'Join the board' }).click();
        await expect(page.getByLabel('Your name')).toBeFocused();
        await expect(page.getByLabel('Your name')).toHaveAttribute('aria-invalid', 'true');
        await expectNoSeriousViolations(page);

        await page.goto(`/e/${'x'.repeat(43)}`);
        await expect(page.getByRole('alert')).toBeFocused();
        await expectNoSeriousViolations(page);
      });

      test('board (empty, offline) has no serious violations', async ({
        page,
        context,
        baseURL,
      }) => {
        const res = await page.request.post('/api/events', {
          headers: { Origin: new URL(baseURL ?? 'http://localhost:3000').origin },
          data: {
            title: "Friendsgiving at Mina's",
            startsAt: '2099-11-21T18:00:00.000Z',
            location: "Mina's flat, 3rd floor",
            hostName: 'Mina',
            hostDietaryNeeds: [],
            slots: [
              { category: 'main', count: 3 },
              { category: 'dessert', count: 2 },
            ],
          },
        });
        const { eventId } = (await res.json()) as { eventId: string };

        await page.goto(`/events/${eventId}`);
        await expect(page.getByText(/^Live/)).toBeVisible();
        await expectNoSeriousViolations(page);

        await context.setOffline(true);
        await expect(page.getByText(/Connection lost/)).toBeVisible();
        await expectNoSeriousViolations(page);
        await context.setOffline(false);
      });
    });
  }

  test('board slots are reachable from the keyboard', async ({ page, baseURL }) => {
    const res = await page.request.post('/api/events', {
      headers: { Origin: new URL(baseURL ?? 'http://localhost:3000').origin },
      data: {
        title: "Friendsgiving at Mina's",
        startsAt: '2099-11-21T18:00:00.000Z',
        hostName: 'Mina',
        hostDietaryNeeds: [],
        slots: [{ category: 'main', count: 2 }],
      },
    });
    const { eventId } = (await res.json()) as { eventId: string };
    await page.goto(`/events/${eventId}`);
    await expect(page.getByText(/^Live/)).toBeVisible();
    const first = page.getByRole('button', { name: 'Claim open Mains slot 1' });
    await first.focus();
    await page.keyboard.press('Tab');
    await expect(page.getByRole('button', { name: 'Claim open Mains slot 2' })).toBeFocused();
    await page.keyboard.press('Shift+Tab');
    await page.keyboard.press('Enter');
    // The claim dialog (F4) opens from ?claim=<slotId>.
    await expect(page).toHaveURL(/\?claim=[0-9a-f-]{36}$/);
  });

  test('the create form works from the keyboard alone', async ({ page }) => {
    await page.goto('/');
    // The native date picker has its own keyboard UI; fill it directly, then use only keys.
    await page.getByLabel('Date & time').fill('2099-11-21T18:00');
    await page.getByLabel('Event name').focus();
    await page.keyboard.type("Friendsgiving at Mina's");
    await page.getByLabel('Your name').focus();
    await page.keyboard.type('Mina');
    await page.keyboard.press('Tab');
    await expect(page.getByRole('button', { name: 'Fewer mains' })).toBeFocused();
    await page.keyboard.press('Tab');
    await expect(page.getByRole('spinbutton', { name: 'Mains' })).toBeFocused();
    await page.keyboard.press('ArrowUp');
    await expect(page.getByRole('spinbutton', { name: 'Mains' })).toHaveAttribute(
      'aria-valuenow',
      '4',
    );
    await page.keyboard.press('Shift+Tab');
    await page.keyboard.press('Shift+Tab');
    await expect(page.getByLabel('Your name')).toBeFocused();
    await page.keyboard.press('Enter');
    await expect(page).toHaveURL(/\/share$/);
    await expect(page.getByText('13 slots')).toBeVisible();
  });

  test('the join form works from the keyboard alone', async ({ page, baseURL }) => {
    const res = await page.request.post('/api/events', {
      headers: { Origin: new URL(baseURL ?? 'http://localhost:3000').origin },
      data: {
        title: "Friendsgiving at Mina's",
        startsAt: '2099-11-21T18:00:00.000Z',
        hostName: 'Mina',
        hostDietaryNeeds: [],
        slots: [{ category: 'main', count: 3 }],
      },
    });
    const { eventId, inviteUrl } = (await res.json()) as { eventId: string; inviteUrl: string };

    await page.goto(new URL(inviteUrl).pathname);
    await page.getByLabel('Your name').focus();
    await page.keyboard.type('Priya');
    await page.keyboard.press('Tab');
    await expect(page.getByRole('button', { name: 'Vegetarian' })).toBeFocused();
    await page.keyboard.press('Space');
    await page.keyboard.press('Tab');
    await page.keyboard.press('Enter');
    await expect(page.getByRole('button', { name: /Vegetarian/ })).toHaveAttribute(
      'aria-pressed',
      'true',
    );
    await expect(page.getByRole('button', { name: /Vegan/ })).toHaveAttribute(
      'aria-pressed',
      'true',
    );
    await page.getByLabel('Your name').focus();
    await page.keyboard.press('Enter');
    await expect(page).toHaveURL(new RegExp(`/events/${eventId}$`));
  });
});
