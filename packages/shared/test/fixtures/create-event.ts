import type { CreateEventInput } from '../../src/index.ts';

const DAY_MS = 24 * 60 * 60 * 1000;

/** The create form's defaults from design/mockup.html, dated a month ahead so it never goes stale. */
export function friendsgivingPayload(now = new Date()): CreateEventInput {
  return {
    title: "Friendsgiving at Mina's",
    startsAt: new Date(now.getTime() + 30 * DAY_MS).toISOString(),
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
  };
}
