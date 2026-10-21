import { createBoard, guestList, joinBoard, newPerson, openLiveBoard } from '../board.ts';
import { expect, test } from '../fixtures.ts';

// The guest list lives in the desktop sidebar (hidden on mobile by design), so these run on the
// desktop projects: chromium-desktop and firefox-desktop.
test.beforeEach(({ isMobile }) => {
  test.skip(isMobile, 'guest list is desktop-only');
});

const RUNS = 20;

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

  const sorted = [...latencies].sort((x, y) => x - y);
  const p95 = sorted[Math.ceil(0.95 * sorted.length) - 1] ?? Number.NaN;
  const summary = `participant.joined propagation over ${RUNS} runs (${info.project.name}): p50 ${Math.round(sorted[Math.floor(sorted.length / 2)] ?? 0)} ms, p95 ${Math.round(p95)} ms, max ${Math.round(sorted.at(-1) ?? 0)} ms`;
  process.stdout.write(`${summary}\n`);
  info.annotations.push({ type: 'p95', description: summary });
  expect(p95).toBeLessThan(500);
});

test('presence count goes from 1 to 2 when a second context opens the board', async ({
  browser,
  page,
  baseURL,
}) => {
  const board = await createBoard(page.request, baseURL);
  await openLiveBoard(page, board.eventId);
  await expect(page.getByRole('status').filter({ hasText: 'Live · 1 here' })).toBeVisible();

  const guest = await newPerson(browser);
  await joinBoard(guest.page.request, baseURL, board.invitePath, 'Priya');
  await openLiveBoard(guest.page, board.eventId);

  // Presence is broadcast at most every 5 s.
  await expect(page.getByRole('status').filter({ hasText: 'Live · 2 here' })).toBeVisible({
    timeout: 8_000,
  });
  await expect(guest.page.getByRole('status').filter({ hasText: 'Live · 2 here' })).toBeVisible();
  await guest.context.close();
});
