import type { TestInfo } from '@playwright/test';
import {
  boardSlots,
  claimSlot,
  createBoard,
  guestList,
  joinBoard,
  newPerson,
  openLiveBoard,
  releaseSlot,
} from '../board.ts';
import { expect, test } from '../fixtures.ts';

// The guest list lives in the desktop sidebar (hidden on mobile by design), so these run on the
// desktop projects: chromium-desktop and firefox-desktop.
test.beforeEach(({ isMobile }) => {
  test.skip(isMobile, 'guest list is desktop-only');
});

const RUNS = 20;

/** Logs p50/p95/max of the runs and attaches them to the report (the README records the p95). */
function report(what: string, latencies: number[], info: TestInfo): number {
  const sorted = [...latencies].sort((x, y) => x - y);
  const p95 = sorted[Math.ceil(0.95 * sorted.length) - 1] ?? Number.NaN;
  const p50 = sorted[Math.floor(sorted.length / 2)] ?? 0;
  const summary = `${what} propagation over ${sorted.length} runs (${info.project.name}): p50 ${Math.round(p50)} ms, p95 ${Math.round(p95)} ms, max ${Math.round(sorted.at(-1) ?? 0)} ms`;
  process.stdout.write(`${summary}
`);
  info.annotations.push({ type: 'p95', description: summary });
  return p95;
}

test("a guest joining in context A appears in context B's guest list within 1 s", async ({
  browser,
  page,
  baseURL,
}, info) => {
  test.setTimeout(90_000);
  // B: the host, watching the board.
  const board = await createBoard(page.request, baseURL);
  await openLiveBoard(page, board.eventId);

  // A: someone else's device, joining over and over.
  const a = await newPerson(browser);
  const latencies: number[] = [];
  for (let i = 1; i <= RUNS; i++) {
    const name = `Guest ${i}`;
    const started = performance.now();
    await joinBoard(a.page.request, baseURL, board.invitePath, name);
    await expect(guestList(page).getByText(name, { exact: true })).toBeVisible({ timeout: 1_000 });
    latencies.push(performance.now() - started);
  }
  await a.context.close();

  expect(report('participant.joined', latencies, info)).toBeLessThan(500);
});

test('claim in context A appears in context B within 1 s', async ({
  browser,
  page,
  baseURL,
}, info) => {
  test.setTimeout(120_000);
  // B: the host, watching the board.
  const board = await createBoard(page.request, baseURL);
  const [slot] = await boardSlots(page.request, board.eventId);
  const slotId = slot?.id as string;
  await openLiveBoard(page, board.eventId);

  // A: a new guest each run (claims are capped at 30/min per session), claiming then releasing.
  const a = await newPerson(browser);
  const latencies: number[] = [];
  for (let i = 1; i <= RUNS; i++) {
    const name = `Guest ${i}`;
    await joinBoard(a.page.request, baseURL, board.invitePath, name);
    const started = performance.now();
    await claimSlot(a.page.request, baseURL, board.eventId, slotId, `Dish ${i}`);
    await expect(
      page.getByRole('article', { name: `Mains slot 1: Dish ${i}, brought by ${name}` }),
    ).toBeVisible({ timeout: 1_000 });
    latencies.push(performance.now() - started);
    await releaseSlot(a.page.request, baseURL, board.eventId, slotId);
    await expect(page.getByRole('button', { name: 'Claim open Mains slot 1' })).toBeVisible();
  }
  await a.context.close();

  expect(report('slot.claimed', latencies, info)).toBeLessThan(500);
});

test('presence count goes from 1 to 2 when a second context opens the board', async ({
  browser,
  page,
  baseURL,
}) => {
  const board = await createBoard(page.request, baseURL);
  await openLiveBoard(page, board.eventId);
  await expect(page.getByText('Live · 1 here')).toBeVisible();

  const guest = await newPerson(browser);
  await joinBoard(guest.page.request, baseURL, board.invitePath, 'Priya');
  await openLiveBoard(guest.page, board.eventId);

  // Presence is broadcast at most every 5 s.
  await expect(page.getByText('Live · 2 here')).toBeVisible({
    timeout: 8_000,
  });
  await expect(guest.page.getByText('Live · 2 here')).toBeVisible();
  await guest.context.close();
});

test('claiming a vegan main in context A flips Vegan from Thin to Covered in context B', async ({
  browser,
  page,
  baseURL,
}) => {
  // B: the host, watching the coverage card in the sidebar.
  const board = await createBoard(page.request, baseURL);
  const a = await newPerson(browser);
  await joinBoard(a.page.request, baseURL, board.invitePath, 'Priya', ['vegan']);
  const slots = await boardSlots(page.request, board.eventId);
  const main = slots.find((s) => s.category === 'main');
  const dessert = slots.find((s) => s.category === 'dessert');
  await claimSlot(a.page.request, baseURL, board.eventId, dessert?.id as string, 'Sorbet', [
    'vegan',
  ]);
  await openLiveBoard(page, board.eventId);

  const coverage = page.getByRole('region', { name: 'Dietary coverage' });
  const vegan = coverage.getByRole('listitem').filter({ hasText: /^Vegan/ });
  await expect(vegan).toContainText('No vegan main yet');
  await expect(page.getByText('Vegan would help').first()).toBeVisible();

  // A: claims a vegan main.
  await claimSlot(a.page.request, baseURL, board.eventId, main?.id as string, 'Mushroom pie', [
    'vegan',
  ]);

  await expect(vegan).toContainText('Covered', { timeout: 1_000 });
  await expect(page.getByText('Vegan would help')).toHaveCount(0);
  await a.context.close();
});
