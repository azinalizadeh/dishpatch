import { describe, expect, it } from 'vitest';
import { ApiErrorSchema, DIETARY, DietarySchema } from '../src/index.ts';

describe('shared schemas (smoke)', () => {
  it('lists the six dietary values in spec order', () => {
    expect(DIETARY).toEqual([
      'vegetarian',
      'vegan',
      'gluten_free',
      'dairy_free',
      'nut_free',
      'halal',
    ]);
  });

  it('accepts known and rejects unknown dietary values', () => {
    expect(DietarySchema.safeParse('vegan').success).toBe(true);
    expect(DietarySchema.safeParse('paleo').success).toBe(false);
  });

  it('parses the standard error body', () => {
    const body = { error: { code: 'NOT_FOUND', message: 'Not found.', requestId: 'req-1' } };
    expect(ApiErrorSchema.parse(body)).toEqual(body);
  });
});
