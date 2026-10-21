import type { Page } from '@playwright/test';
import { createBoard, joinBoard, newPerson, openLiveBoard } from '../board.ts';
import { expect, test } from '../fixtures.ts';

/** 'won' once the dialog has closed on success, 'lost' once it shows the conflict alert. */
async function outcome(page: Page): Promise<'won' | 'lost'> {
  const dialog = page.getByRole('dialog', { name: 'What are you bringing?' });
  const read = async () => {
    if ((await dialog.count()) === 0) return 'won' as const;
    return (await dialog.getByRole('alert').count()) > 0 ? ('lost' as const) : ('pending' as const);
  };
  await expect.poll(read).not.toBe('pending');
  const result = await read();
  if (result === 'pending') throw new Error('claim never settled');
  return result;
}

test('two guests submit the same slot, one sees their card, the other sees "just claimed this slot"', async ({
  browser,
  page,
  baseURL,
}) => {
  const board = await createBoard(page.request, baseURL);
  const names = ['Priya', 'Jonah'] as const;
  const guests = [await newPerson(browser), await newPerson(browser)];
  for (const [i, guest] of guests.entries()) {
    await joinBoard(guest.page.request, baseURL, board.invitePath, names[i] as string);
    await openLiveBoard(guest.page, board.eventId);
    await guest.page.getByRole('button', { name: 'Claim open Mains slot 1' }).click();
    await guest.page.getByRole('dialog').getByLabel('Dish').fill(`${names[i]}'s pie`);
  }

  // Both press "Claim slot" at the same moment.
  await Promise.all(
    guests.map(({ page: p }) =>
      p.getByRole('dialog').getByRole('button', { name: 'Claim slot' }).click(),
    ),
  );
  const outcomes = await Promise.all(guests.map(({ page: p }) => outcome(p)));

  expect([...outcomes].sort()).toEqual(['lost', 'won']);
  const winner = outcomes.indexOf('won');
  const winnerName = names[winner] as string;
  const winnerPage = guests[winner]?.page as Page;
  const loserPage = guests[1 - winner]?.page as Page;

  await expect(
    winnerPage.getByRole('article', {
      name: `Mains slot 1: ${winnerName}'s pie, brought by ${winnerName}`,
    }),
  ).toBeVisible();
  await expect(loserPage.getByRole('dialog').getByRole('alert')).toContainText(
    `${winnerName} just claimed this slot.`,
  );
  // The loser's optimistic card is gone: the board shows only the winner's dish.
  await loserPage.getByRole('button', { name: 'Back to board' }).click();
  await expect(loserPage.getByRole('dialog')).toHaveCount(0);
  await expect(
    loserPage.getByRole('article', {
      name: `Mains slot 1: ${winnerName}'s pie, brought by ${winnerName}`,
    }),
  ).toBeVisible();
  await expect(loserPage.getByRole('article')).toHaveCount(1);

  for (const guest of guests) await guest.context.close();
});
