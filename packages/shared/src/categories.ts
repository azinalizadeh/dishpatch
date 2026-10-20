export const CATEGORIES = ['main', 'side', 'salad', 'dessert', 'drinks'] as const;

export type Category = (typeof CATEGORIES)[number];

/** Limits from 04-architecture.md › Limits. */
export const LIMITS = {
  titleMax: 80,
  locationMax: 120,
  nameMax: 40,
  slotsPerCategoryMax: 12,
  slotsTotalMax: 40,
} as const;
