export const DIETARY = [
  'vegetarian',
  'vegan',
  'gluten_free',
  'dairy_free',
  'nut_free',
  'halal',
] as const;

export type Dietary = (typeof DIETARY)[number];

/** Display labels from 03-design.md (join chips, tags, coverage). */
export const DIETARY_LABELS: Record<Dietary, string> = {
  vegetarian: 'Vegetarian',
  vegan: 'Vegan',
  gluten_free: 'Gluten-free',
  dairy_free: 'Dairy-free',
  nut_free: 'Nut-free',
  halal: 'Halal',
};
