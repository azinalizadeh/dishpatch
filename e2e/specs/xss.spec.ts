import { boardSlots, claimSlot, createBoard, openLiveBoard } from '../board.ts';
import { expect, test } from '../fixtures.ts';

test('dish name with <img onerror> renders as text', async ({ page, baseURL }) => {
  const board = await createBoard(page.request, baseURL);
  const [slot] = await boardSlots(page.request, board.eventId);
  const dishName = '<img src=x onerror="window.__xss=1">';
  await claimSlot(page.request, baseURL, board.eventId, slot?.id as string, dishName);

  await openLiveBoard(page, board.eventId);

  const card = page.getByRole('article', { name: `Mains slot 1: ${dishName}, brought by Mina` });
  await expect(card).toBeVisible();
  await expect(card.getByText(dishName, { exact: true })).toBeVisible();
  await expect(card.locator('img')).toHaveCount(0);
  expect(await page.evaluate(() => (window as { __xss?: number }).__xss)).toBeUndefined();
});
