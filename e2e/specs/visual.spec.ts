import { mkdirSync } from 'node:fs';
import { join } from 'node:path';
import type { Browser, BrowserContextOptions, Page } from '@playwright/test';
import { clientIp, test } from '../fixtures.ts';

/**
 * Screenshots for the design-parity check (skills/custom/design-parity): one per
 * design/screens/<id>[-state][-mobile][-dark].png, saved to e2e/visual-output/ under the same
 * name. A review aid, not a pixel-diff gate.
 */
const OUT = join(import.meta.dirname, '..', 'visual-output');

const VIEWPORTS = {
  desktop: { viewport: { width: 1440, height: 900 } },
  mobile: { viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true },
} satisfies Record<string, BrowserContextOptions>;

type Variant = { suffix: string; options: BrowserContextOptions };

const VARIANTS: Variant[] = [
  { suffix: '', options: { ...VIEWPORTS.desktop, colorScheme: 'light' } },
  { suffix: '-dark', options: { ...VIEWPORTS.desktop, colorScheme: 'dark' } },
  { suffix: '-mobile', options: { ...VIEWPORTS.mobile, colorScheme: 'light' } },
  { suffix: '-mobile-dark', options: { ...VIEWPORTS.mobile, colorScheme: 'dark' } },
];

// Screenshots only need one browser project.
test.beforeEach(({ browserName }, info) => {
  test.skip(info.project.name !== 'chromium-desktop' || browserName !== 'chromium');
});

async function open(browser: Browser, options: BrowserContextOptions) {
  const context = await browser.newContext({
    ...options,
    locale: 'en-GB',
    timezoneId: 'Europe/London',
    reducedMotion: 'reduce',
    permissions: ['clipboard-read', 'clipboard-write'],
    extraHTTPHeaders: { 'X-Forwarded-For': clientIp() },
  });
  return { context, page: await context.newPage() };
}

async function shot(page: Page, name: string) {
  mkdirSync(OUT, { recursive: true });
  await page.evaluate(() => document.fonts.ready);
  await page.screenshot({ path: join(OUT, `${name}.png`) });
}

async function fillMockupForm(page: Page, { past = false, withName = true } = {}) {
  await page.goto('/');
  await page.getByLabel('Event name').fill("Friendsgiving at Mina's");
  // The mockup's date (21 Nov, 18:00), moved to next year once it has passed.
  const now = new Date();
  const year =
    now < new Date(now.getFullYear(), 10, 21, 18) ? now.getFullYear() : now.getFullYear() + 1;
  await page.getByLabel('Date & time').fill(past ? '2024-11-01T18:00' : `${year}-11-21T18:00`);
  await page.getByLabel('Where').fill("Mina's flat, 3rd floor");
  if (withName) await page.getByLabel('Your name').fill('Mina');
}

for (const { suffix, options } of VARIANTS) {
  test(`create${suffix}`, async ({ browser }) => {
    const { context, page } = await open(browser, options);
    await fillMockupForm(page);
    await page.getByLabel('Your name').blur();
    await shot(page, `create${suffix}`);
    await context.close();
  });

  test(`share${suffix}`, async ({ browser }) => {
    const { context, page } = await open(browser, options);
    await fillMockupForm(page);
    await page.getByRole('button', { name: 'Create board' }).click();
    await page.getByRole('heading', { name: "Friendsgiving at Mina's" }).waitFor();
    await shot(page, `share${suffix}`);
    if (!suffix.endsWith('-dark')) {
      await page.getByRole('button', { name: 'Copy invite link' }).click();
      await page.getByRole('status').filter({ hasText: 'Invite link copied' }).waitFor();
      await page.getByRole('button', { name: 'Copy invite link' }).blur();
      await shot(page, `share-copied${suffix}`);
    }
    await context.close();
  });

  test(`notfound${suffix}`, async ({ browser }) => {
    const { context, page } = await open(browser, options);
    await page.goto('/no/such/board');
    await page.getByRole('heading', { name: 'Nothing on this plate' }).waitFor();
    await shot(page, `notfound${suffix}`);
    await context.close();
  });
}

for (const { suffix, options } of VARIANTS.filter((v) => !v.suffix.endsWith('-dark'))) {
  test(`create-error${suffix}`, async ({ browser }) => {
    const { context, page } = await open(browser, options);
    await fillMockupForm(page, { past: true, withName: false });
    await page.getByRole('button', { name: 'Create board' }).click();
    await page.getByRole('alert').waitFor();
    await page.getByRole('alert').blur();
    await shot(page, `create-error${suffix}`);
    await context.close();
  });
}
