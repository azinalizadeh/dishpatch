import type { Category } from '@dishpatch/shared';

/** Display names and colour dots per category (03-design.md › Category colours). */
export const CATEGORY_LABELS: Record<
  Category,
  { plural: string; singular: string; dot: string; border: string }
> = {
  main: { plural: 'Mains', singular: 'main', dot: 'bg-cat-main', border: 'border-l-cat-main' },
  side: { plural: 'Sides', singular: 'side', dot: 'bg-cat-side', border: 'border-l-cat-side' },
  salad: { plural: 'Salads', singular: 'salad', dot: 'bg-cat-salad', border: 'border-l-cat-salad' },
  dessert: {
    plural: 'Desserts',
    singular: 'dessert',
    dot: 'bg-cat-dessert',
    border: 'border-l-cat-dessert',
  },
  drinks: {
    plural: 'Drinks',
    singular: 'drink',
    dot: 'bg-cat-drinks',
    border: 'border-l-cat-drinks',
  },
};
