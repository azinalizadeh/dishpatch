import type { Category } from '@dishpatch/shared';

/** Display names and colour dots per category (03-design.md › Category colours). */
export const CATEGORY_LABELS: Record<Category, { plural: string; dot: string }> = {
  main: { plural: 'Mains', dot: 'bg-cat-main' },
  side: { plural: 'Sides', dot: 'bg-cat-side' },
  salad: { plural: 'Salads', dot: 'bg-cat-salad' },
  dessert: { plural: 'Desserts', dot: 'bg-cat-dessert' },
  drinks: { plural: 'Drinks', dot: 'bg-cat-drinks' },
};
