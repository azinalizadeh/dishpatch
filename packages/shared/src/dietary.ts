export const DIETARY = [
  'vegetarian',
  'vegan',
  'gluten_free',
  'dairy_free',
  'nut_free',
  'halal',
] as const;

export type Dietary = (typeof DIETARY)[number];
