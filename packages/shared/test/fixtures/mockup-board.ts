import type { Category, Dietary, ParticipantView, SlotView } from '../../src/index.ts';

/**
 * The board from design/mockup.html: six people, six claims. Coverage on it is
 * Nut-free gap, Vegan thin, Gluten-free ok, Halal ok.
 */
export const MOCKUP_PEOPLE: {
  displayName: string;
  dietaryNeeds: Dietary[];
  role: 'host' | 'guest';
}[] = [
  { displayName: 'Mina', dietaryNeeds: ['halal'], role: 'host' },
  { displayName: 'Reza', dietaryNeeds: ['halal'], role: 'guest' },
  { displayName: 'Sam', dietaryNeeds: ['vegan'], role: 'guest' },
  { displayName: 'Leila', dietaryNeeds: ['nut_free'], role: 'guest' },
  { displayName: 'Jonah', dietaryNeeds: ['gluten_free'], role: 'guest' },
  { displayName: 'Priya', dietaryNeeds: ['vegan'], role: 'guest' },
];

/** Slot counts per category, as on the mockup (3 mains, 3 sides, 2 salads, 2 desserts, 2 drinks). */
export const MOCKUP_SLOTS: { category: Category; count: number }[] = [
  { category: 'main', count: 3 },
  { category: 'side', count: 3 },
  { category: 'salad', count: 2 },
  { category: 'dessert', count: 2 },
  { category: 'drinks', count: 2 },
];

export const MOCKUP_CLAIMS: {
  by: string;
  category: Category;
  position: number;
  dishName: string;
  dishTags: Dietary[];
}[] = [
  {
    by: 'Reza',
    category: 'main',
    position: 0,
    dishName: 'Ghormeh sabzi',
    dishTags: ['gluten_free', 'dairy_free', 'halal'],
  },
  {
    by: 'Mina',
    category: 'main',
    position: 1,
    dishName: 'Roast chicken & sumac onions',
    dishTags: ['gluten_free', 'halal'],
  },
  {
    by: 'Sam',
    category: 'side',
    position: 0,
    dishName: 'Crispy tahdig',
    dishTags: ['vegetarian', 'halal'],
  },
  {
    by: 'Priya',
    category: 'side',
    position: 1,
    dishName: 'Garlic green beans',
    dishTags: ['vegan', 'gluten_free'],
  },
  {
    by: 'Jonah',
    category: 'salad',
    position: 0,
    dishName: 'Shirazi salad',
    dishTags: ['vegan', 'gluten_free'],
  },
  {
    by: 'Leila',
    category: 'dessert',
    position: 0,
    dishName: 'Saffron rice pudding',
    dishTags: ['vegetarian', 'gluten_free'],
  },
];

const uuid = (n: number) => `00000000-0000-4000-8000-${n.toString(16).padStart(12, '0')}`;

/** The mockup board as in-memory views, for unit and component tests. */
export function mockupBoard(): { participants: ParticipantView[]; slots: SlotView[] } {
  const participants = MOCKUP_PEOPLE.map((p, i) => ({ id: uuid(i + 1), ...p }));
  const slots: SlotView[] = [];
  let n = 100;
  for (const { category, count } of MOCKUP_SLOTS) {
    for (let position = 0; position < count; position++) {
      const claim = MOCKUP_CLAIMS.find((c) => c.category === category && c.position === position);
      const by = claim && participants.find((p) => p.displayName === claim.by);
      slots.push({
        id: uuid(n++),
        category,
        position,
        claimedBy: by ? { id: by.id, displayName: by.displayName } : null,
        dishName: claim?.dishName ?? null,
        dishTags: claim?.dishTags ?? [],
      });
    }
  }
  return { participants, slots };
}
