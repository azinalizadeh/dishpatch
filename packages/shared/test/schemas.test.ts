import { describe, expect, it } from 'vitest';
import {
  ApiErrorSchema,
  CATEGORIES,
  ClaimInput,
  CreateEventInput,
  DIETARY,
  DietarySchema,
  ERROR_CODES,
  JoinInput,
  SlotCountInput,
} from '../src/index.ts';
import { friendsgivingPayload } from './fixtures/create-event.ts';

function issuePaths(input: unknown): string[] {
  const result = CreateEventInput.safeParse(input);
  return result.success ? [] : result.error.issues.map((issue) => issue.path.join('.'));
}

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

  it('lists the five slot categories and the error codes from the API contract', () => {
    expect(CATEGORIES).toEqual(['main', 'side', 'salad', 'dessert', 'drinks']);
    expect(ERROR_CODES).toEqual(
      expect.arrayContaining(['VALIDATION', 'NOT_FOUND', 'RATE_LIMITED', 'INTERNAL', 'BAD_ORIGIN']),
    );
  });
});

describe('CreateEventInput', () => {
  it('CreateEventInput accepts the default Friendsgiving payload', () => {
    const payload = friendsgivingPayload();
    expect(CreateEventInput.parse(payload)).toEqual(payload);
  });

  it('rejects title over 80 characters', () => {
    expect(issuePaths({ ...friendsgivingPayload(), title: 'x'.repeat(81) })).toEqual(['title']);
  });

  it('rejects a start date in the past', () => {
    expect(issuePaths({ ...friendsgivingPayload(), startsAt: '2020-11-21T17:00:00.000Z' })).toEqual(
      ['startsAt'],
    );
  });

  it('rejects more than 12 slots in one category and 0 slots in total', () => {
    const tooMany = {
      ...friendsgivingPayload(),
      slots: [{ category: 'main', count: 13 }],
    };
    expect(issuePaths(tooMany)).toEqual(['slots.0.count']);

    const none = {
      ...friendsgivingPayload(),
      slots: [
        { category: 'main', count: 0 },
        { category: 'side', count: 0 },
      ],
    };
    expect(issuePaths(none)).toEqual(['slots']);
  });

  it('rejects unknown dietary value', () => {
    expect(issuePaths({ ...friendsgivingPayload(), hostDietaryNeeds: ['keto'] })).toEqual([
      'hostDietaryNeeds.0',
    ]);
  });

  it('rejects an empty or whitespace-only title and name, with the design copy for the name', () => {
    const result = CreateEventInput.safeParse({
      ...friendsgivingPayload(),
      title: '   ',
      hostName: '',
    });
    expect(result.success).toBe(false);
    const issues = result.success ? [] : result.error.issues;
    expect(issues.map((i) => i.path.join('.'))).toEqual(['title', 'hostName']);
    expect(issues[1]?.message).toBe("Add a name so guests know who's hosting.");
  });

  it('trims text, turns a blank location into undefined and keeps an omitted one omitted', () => {
    const parsed = CreateEventInput.parse({
      ...friendsgivingPayload(),
      title: "  Friendsgiving at Mina's ",
      location: '   ',
    });
    expect(parsed.title).toBe("Friendsgiving at Mina's");
    expect(parsed.location).toBeUndefined();

    const { location: _omitted, ...withoutLocation } = friendsgivingPayload();
    expect(CreateEventInput.parse(withoutLocation).location).toBeUndefined();
  });

  it('rejects control characters, more than 40 slots, repeated categories and duplicate needs', () => {
    expect(issuePaths({ ...friendsgivingPayload(), hostName: 'Mi\u0007na' })).toEqual(['hostName']);
    const fortyOne = {
      ...friendsgivingPayload(),
      slots: [
        { category: 'main', count: 12 },
        { category: 'side', count: 12 },
        { category: 'salad', count: 12 },
        { category: 'dessert', count: 5 },
      ],
    };
    expect(issuePaths(fortyOne)).toEqual(['slots']);
    const repeated = {
      ...friendsgivingPayload(),
      slots: [
        { category: 'main', count: 1 },
        { category: 'main', count: 1 },
      ],
    };
    expect(issuePaths(repeated)).toEqual(['slots']);
    expect(issuePaths({ ...friendsgivingPayload(), hostDietaryNeeds: ['vegan', 'vegan'] })).toEqual(
      ['hostDietaryNeeds'],
    );
  });

  it('SlotCountInput allows 0 to 12 of a known category', () => {
    expect(SlotCountInput.safeParse({ category: 'drinks', count: 0 }).success).toBe(true);
    expect(SlotCountInput.safeParse({ category: 'drinks', count: 12 }).success).toBe(true);
    expect(SlotCountInput.safeParse({ category: 'drinks', count: 1.5 }).success).toBe(false);
    expect(SlotCountInput.safeParse({ category: 'other', count: 1 }).success).toBe(false);
  });
});

describe('JoinInput', () => {
  it('JoinInput trims names and dedupes dietary needs', () => {
    expect(
      JoinInput.parse({ displayName: '  Sam  ', dietaryNeeds: ['vegan', 'halal', 'vegan'] }),
    ).toEqual({ displayName: 'Sam', dietaryNeeds: ['vegan', 'halal'] });
  });

  it('rejects a name with control characters', () => {
    const result = JoinInput.safeParse({ displayName: 'Sa\u0000m', dietaryNeeds: [] });
    expect(result.success).toBe(false);
    expect(result.error?.issues.map((i) => i.path.join('.'))).toEqual(['displayName']);
  });

  it('rejects a name of only spaces and unknown needs', () => {
    const result = JoinInput.safeParse({ displayName: '   ', dietaryNeeds: ['keto'] });
    expect(result.error?.issues.map((i) => i.path.join('.'))).toEqual([
      'displayName',
      'dietaryNeeds.0',
    ]);
  });

  it('counts emoji names by code points, up to 40', () => {
    expect(JoinInput.safeParse({ displayName: '🥧'.repeat(40), dietaryNeeds: [] }).success).toBe(
      true,
    );
    expect(JoinInput.safeParse({ displayName: '🥧'.repeat(41), dietaryNeeds: [] }).success).toBe(
      false,
    );
  });
});

describe('ClaimInput', () => {
  it('ClaimInput rejects empty and 61-char dish names', () => {
    const empty = ClaimInput.safeParse({ dishName: '   ', dishTags: [] });
    expect(empty.success).toBe(false);
    expect(empty.error?.issues[0]?.message).toBe("Add the dish you're bringing.");

    const long = ClaimInput.safeParse({ dishName: 'a'.repeat(61), dishTags: [] });
    expect(long.success).toBe(false);
    expect(long.error?.issues[0]?.message).toBe('Keep the dish under 60 characters.');

    expect(ClaimInput.safeParse({ dishName: '🥧'.repeat(60), dishTags: [] }).success).toBe(true);
  });

  it('trims the dish, dedupes tags and rejects unknown tags', () => {
    expect(
      ClaimInput.parse({ dishName: '  Mushroom pie ', dishTags: ['vegan', 'vegan', 'nut_free'] }),
    ).toEqual({ dishName: 'Mushroom pie', dishTags: ['vegan', 'nut_free'] });
    expect(ClaimInput.safeParse({ dishName: 'Pie', dishTags: ['keto'] }).success).toBe(false);
    expect(ClaimInput.safeParse({ dishName: 'Pie', dishTags: [] }).success).toBe(false);
  });
});
