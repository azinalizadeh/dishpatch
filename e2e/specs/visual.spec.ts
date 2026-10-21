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
      await page.getByText('Invite link copied').waitFor();
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

/** The mockup's board (21 Nov 18:00, "6 going") created and joined through the public API. */
async function seedMockupBoard(page: Page, baseURL: string | undefined): Promise<string> {
  const now = new Date();
  const year =
    now < new Date(now.getFullYear(), 10, 21, 18) ? now.getFullYear() : now.getFullYear() + 1;
  const headers = { Origin: new URL(baseURL ?? 'http://localhost:3000').origin };
  const res = await page.request.post('/api/events', {
    headers,
    data: {
      title: "Friendsgiving at Mina's",
      startsAt: new Date(`${year}-11-21T18:00:00Z`).toISOString(),
      location: "Mina's flat, 3rd floor",
      hostName: 'Mina',
      hostDietaryNeeds: [],
      slots: [{ category: 'main', count: 3 }],
    },
  });
  const { inviteUrl } = (await res.json()) as { inviteUrl: string };
  const invitePath = new URL(inviteUrl).pathname;
  for (const name of ['Reza', 'Leila', 'Jonah', 'Sam', 'Ana']) {
    await page.request.post(`/api/invites${invitePath.slice(2)}/join`, {
      headers,
      data: { displayName: name, dietaryNeeds: [] },
    });
  }
  return invitePath;
}

for (const { suffix, options } of VARIANTS) {
  test(`join${suffix}`, async ({ browser, baseURL }) => {
    const { context, page } = await open(browser, options);
    const invitePath = await seedMockupBoard(page, baseURL);
    // Joining from a fresh context, so this browser has no session for the board yet.
    const guest = await open(browser, options);
    await guest.page.goto(invitePath);
    await guest.page.getByLabel('Your name').fill('Priya');
    await guest.page.getByRole('button', { name: 'Vegan' }).click();
    await guest.page.getByLabel('Your name').focus();
    await guest.page.getByLabel('Your name').blur();
    await shot(guest.page, `join${suffix}`);
    await guest.context.close();
    await context.close();
  });
}

for (const { suffix, options } of VARIANTS.filter((v) => !v.suffix.endsWith('-dark'))) {
  test(`join-error${suffix}`, async ({ browser }) => {
    const { context, page } = await open(browser, options);
    await page.goto(`/e/${'x'.repeat(43)}`);
    await page.getByRole('alert').waitFor();
    await page.getByRole('alert').blur();
    await shot(page, `join-error${suffix}`);
    await context.close();
  });

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

/** The mockup's six claims (design/screens/board.png): [who, category index slot, dish, tags]. */
const MOCKUP_CLAIMS: [string, number, string, string[]][] = [
  ['Mina', 1, 'Roast chicken & sumac onions', ['gluten_free', 'halal']],
  ['Reza', 0, 'Ghormeh sabzi', ['gluten_free', 'dairy_free', 'halal']],
  ['Sam', 3, 'Crispy tahdig', ['vegetarian', 'halal']],
  ['Leila', 8, 'Saffron rice pudding', ['vegetarian', 'gluten_free']],
  ['Jonah', 6, 'Shirazi salad', ['vegan', 'gluten_free']],
  ['Priya', 4, 'Garlic green beans', ['vegan', 'gluten_free']],
];

/**
 * The mockup's board: 12 slots, Mina hosting, five guests joined, viewed by Priya; with
 * `withClaims`, the six claimed dishes too. Returns Priya's page on the board.
 */
async function openMockupBoardAsPriya(
  browser: Browser,
  options: BrowserContextOptions,
  baseURL: string | undefined,
  { withClaims = false } = {},
) {
  const host = await open(browser, options);
  const now = new Date();
  const year =
    now < new Date(now.getFullYear(), 10, 21, 18) ? now.getFullYear() : now.getFullYear() + 1;
  const headers = { Origin: new URL(baseURL ?? 'http://localhost:3000').origin };
  const res = await host.page.request.post('/api/events', {
    headers,
    data: {
      title: "Friendsgiving at Mina's",
      startsAt: new Date(`${year}-11-21T18:00:00Z`).toISOString(),
      location: "Mina's flat, 3rd floor",
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
  });
  const { eventId, inviteUrl } = (await res.json()) as { eventId: string; inviteUrl: string };
  const join = `/api/invites/${new URL(inviteUrl).pathname.split('/').pop()}/join`;
  const slotsRes = await host.page.request.get(`/api/events/${eventId}`);
  const slotIds = ((await slotsRes.json()) as { slots: { id: string }[] }).slots.map((s) => s.id);
  // Each join replaces the session cookie in this request context, so whoever joined last claims.
  const claimAs = async (request: typeof host.page.request, who: string) => {
    const claim = withClaims && MOCKUP_CLAIMS.find(([name]) => name === who);
    if (!claim) return;
    const [, index, dishName, dishTags] = claim;
    await request.post(`/api/events/${eventId}/slots/${slotIds[index]}/claim`, {
      headers,
      data: { dishName, dishTags },
    });
  };
  await claimAs(host.page.request, 'Mina');
  const guests: [string, string[]][] = [
    ['Reza', ['halal']],
    ['Sam', []],
    ['Leila', ['nut_free']],
    ['Jonah', ['gluten_free']],
  ];
  for (const [displayName, dietaryNeeds] of guests) {
    await host.page.request.post(join, { headers, data: { displayName, dietaryNeeds } });
    await claimAs(host.page.request, displayName);
  }
  await host.context.close();
  const priya = await open(browser, options);
  await priya.page.request.post(join, {
    headers,
    data: { displayName: 'Priya', dietaryNeeds: ['vegan'] },
  });
  await claimAs(priya.page.request, 'Priya');
  return { ...priya, eventId };
}

for (const { suffix, options } of VARIANTS) {
  test(`board-empty${suffix}`, async ({ browser, baseURL }) => {
    const { context, page, eventId } = await openMockupBoardAsPriya(browser, options, baseURL);
    await page.goto(`/events/${eventId}`);
    await page.getByText('Live').first().waitFor();
    await shot(page, `board-empty${suffix}`);
    await context.close();
  });

  test(`board-offline${suffix}`, async ({ browser, baseURL }) => {
    const { context, page, eventId } = await openMockupBoardAsPriya(browser, options, baseURL);
    await page.goto(`/events/${eventId}`);
    await page.getByText('Live').first().waitFor();
    await context.setOffline(true);
    await page.getByText(/Connection lost/).waitFor();
    await shot(page, `board-offline${suffix}`);
    await context.close();
  });
}

for (const { suffix, options } of VARIANTS.filter((v) => !v.suffix.endsWith('-dark'))) {
  test(`board-loading${suffix}`, async ({ browser, baseURL }) => {
    const { context, page, eventId } = await openMockupBoardAsPriya(browser, options, baseURL);
    await page.route('**/api/events/*', () => {}); // never answers
    await page.goto(`/events/${eventId}`);
    await page.getByRole('status', { name: 'Loading the board' }).waitFor();
    await shot(page, `board-loading${suffix}`);
    await context.close();
  });
}

/** The claim dialog over the mockup board, on the one open main (slot 3; the mockup shows "slot 2 of 3"). */
async function openClaimDialog(page: Page, eventId: string) {
  await page.goto(`/events/${eventId}`);
  await page.getByText('Live').first().waitFor();
  await page.getByRole('button', { name: 'Claim open Mains slot 3' }).click();
  const dialog = page.getByRole('dialog', { name: 'What are you bringing?' });
  await dialog.getByLabel('Dish').fill('Mushroom & chestnut pie');
  for (const tag of ['Vegetarian', 'Vegan', 'Dairy-free', 'Halal']) {
    await dialog.getByRole('button', { name: tag }).click();
  }
  return dialog;
}

for (const { suffix, options } of VARIANTS) {
  test(`board${suffix}`, async ({ browser, baseURL }) => {
    const { context, page, eventId } = await openMockupBoardAsPriya(browser, options, baseURL, {
      withClaims: true,
    });
    await page.goto(`/events/${eventId}`);
    await page.getByText('Live').first().waitFor();
    await shot(page, `board${suffix}`);
    await context.close();
  });

  test(`claim${suffix}`, async ({ browser, baseURL }) => {
    const { context, page, eventId } = await openMockupBoardAsPriya(browser, options, baseURL, {
      withClaims: true,
    });
    await openClaimDialog(page, eventId);
    await shot(page, `claim${suffix}`);
    await context.close();
  });

  test(`claim-error${suffix}`, async ({ browser, baseURL }) => {
    const { context, page, eventId } = await openMockupBoardAsPriya(browser, options, baseURL, {
      withClaims: true,
    });
    const dialog = await openClaimDialog(page, eventId);
    // The server answers as if Jonah won the race, without changing the board behind the dialog.
    await page.route('**/api/events/*/slots/*/claim', (route) =>
      route.fulfill({
        status: 409,
        json: {
          error: {
            code: 'SLOT_TAKEN',
            message: 'Jonah just claimed this slot.',
            requestId: 'visual',
            claimedBy: 'Jonah',
          },
        },
      }),
    );
    await dialog.getByRole('button', { name: 'Claim slot' }).click();
    await dialog.getByRole('alert').waitFor();
    await dialog.getByRole('alert').blur();
    await shot(page, `claim-error${suffix}`);
    await context.close();
  });
}

for (const { suffix, options } of VARIANTS.filter((v) => !v.suffix.endsWith('-dark'))) {
  test(`claim-submitting${suffix}`, async ({ browser, baseURL }) => {
    const { context, page, eventId } = await openMockupBoardAsPriya(browser, options, baseURL, {
      withClaims: true,
    });
    const dialog = await openClaimDialog(page, eventId);
    await page.route('**/api/events/*/slots/*/claim', () => {}); // never answers
    await dialog.getByRole('button', { name: 'Claim slot' }).click();
    await dialog.getByRole('button', { name: 'Claiming…' }).waitFor();
    await shot(page, `claim-submitting${suffix}`);
    await context.close();
  });
}
