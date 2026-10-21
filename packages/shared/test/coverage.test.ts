import { describe, expect, it } from 'vitest';
import {
  type Category,
  computeCoverage,
  DIETARY,
  type Dietary,
  effectiveTags,
  type NeedCoverage,
  previewCoverage,
  type SlotView,
  topHint,
} from '../src/index.ts';
import { mockupBoard } from './fixtures/mockup-board.ts';

let nextId = 0;
const id = () => `00000000-0000-4000-8000-${(++nextId).toString(16).padStart(12, '0')}`;

function dish(category: Category, dishTags: Dietary[]): SlotView {
  return {
    id: id(),
    category,
    position: 0,
    claimedBy: { id: id(), displayName: 'Someone' },
    dishName: 'A dish',
    dishTags,
  };
}

function open(category: Category): SlotView {
  return { id: id(), category, position: 0, claimedBy: null, dishName: null, dishTags: [] };
}

const guests = (...needs: Dietary[][]) => needs.map((dietaryNeeds) => ({ dietaryNeeds }));

function row(coverage: NeedCoverage[], need: Dietary): NeedCoverage | undefined {
  return coverage.find((r) => r.need === need);
}

describe('effectiveTags', () => {
  it('adds vegetarian and dairy-free to vegan', () => {
    expect(effectiveTags(['vegan'])).toEqual(new Set(['vegan', 'vegetarian', 'dairy_free']));
  });

  it('leaves other tags as they are', () => {
    expect(effectiveTags(['halal', 'nut_free'])).toEqual(new Set(['halal', 'nut_free']));
  });
});

describe('computeCoverage', () => {
  it('vegan dish counts for vegetarian and dairy-free guests', () => {
    const coverage = computeCoverage(guests(['vegetarian'], ['dairy_free']), [
      dish('main', ['vegan']),
      dish('side', ['vegan']),
    ]);
    expect(row(coverage, 'vegetarian')).toMatchObject({ dishes: 2, mains: 1, status: 'ok' });
    expect(row(coverage, 'dairy_free')).toMatchObject({ dishes: 2, mains: 1, status: 'ok' });
  });

  it('two vegan guests with vegan side and salad only is thin', () => {
    const coverage = computeCoverage(guests(['vegan'], ['vegan']), [
      dish('side', ['vegan']),
      dish('salad', ['vegan']),
    ]);
    expect(coverage).toEqual([{ need: 'vegan', guests: 2, dishes: 2, mains: 0, status: 'thin' }]);
  });

  it('one nut-free guest and no nut-free dish is gap', () => {
    const coverage = computeCoverage(guests(['nut_free']), [dish('main', ['halal']), open('main')]);
    expect(coverage).toEqual([{ need: 'nut_free', guests: 1, dishes: 0, mains: 0, status: 'gap' }]);
  });

  it('a single compatible main and nothing else is thin', () => {
    const coverage = computeCoverage(guests(['halal']), [dish('main', ['halal'])]);
    expect(row(coverage, 'halal')).toMatchObject({ dishes: 1, mains: 1, status: 'thin' });
  });

  it('one compatible main plus one other compatible dish is ok', () => {
    const coverage = computeCoverage(guests(['halal']), [
      dish('main', ['halal']),
      dish('dessert', ['halal']),
    ]);
    expect(row(coverage, 'halal')).toMatchObject({ dishes: 2, mains: 1, status: 'ok' });
  });

  it('needs nobody has are omitted', () => {
    const coverage = computeCoverage(guests([], ['halal']), [dish('main', ['vegan', 'nut_free'])]);
    expect(coverage.map((r) => r.need)).toEqual(['halal']);
    expect(computeCoverage([], [dish('main', ['vegan'])])).toEqual([]);
  });

  it('result is sorted gap, thin, ok then by guests desc', () => {
    const coverage = computeCoverage(
      guests(['halal', 'vegan'], ['halal'], ['halal', 'nut_free'], ['gluten_free'], ['vegan']),
      [dish('main', ['halal']), dish('side', ['halal']), dish('salad', ['vegan'])],
    );
    expect(coverage.map((r) => [r.need, r.status])).toEqual([
      ['gluten_free', 'gap'],
      ['nut_free', 'gap'],
      ['vegan', 'thin'],
      ['halal', 'ok'],
    ]);
    // Ties inside a status go to the need with more guests.
    const ties = computeCoverage(guests(['nut_free'], ['gluten_free'], ['gluten_free']), []);
    expect(ties.map((r) => r.need)).toEqual(['gluten_free', 'nut_free']);
  });

  it('ignores open slots and dishes with no tags', () => {
    const coverage = computeCoverage(guests(['vegetarian']), [open('main'), dish('main', [])]);
    expect(row(coverage, 'vegetarian')).toMatchObject({ dishes: 0, status: 'gap' });
  });

  it('handles a guest with all six needs', () => {
    const coverage = computeCoverage(guests([...DIETARY]), [dish('main', ['vegan'])]);
    expect(coverage).toHaveLength(6);
    expect(row(coverage, 'dairy_free')?.status).toBe('thin');
    expect(row(coverage, 'halal')?.status).toBe('gap');
  });

  it('matches the mockup board', () => {
    const { participants, slots } = mockupBoard();
    expect(computeCoverage(participants, slots)).toEqual([
      { need: 'nut_free', guests: 1, dishes: 0, mains: 0, status: 'gap' },
      { need: 'vegan', guests: 2, dishes: 2, mains: 0, status: 'thin' },
      { need: 'halal', guests: 2, dishes: 3, mains: 2, status: 'ok' },
      { need: 'gluten_free', guests: 1, dishes: 5, mains: 2, status: 'ok' },
    ]);
  });

  it('computes 100 guests on a full board in under 1 ms', () => {
    const people = Array.from({ length: 100 }, (_, i) => ({
      dietaryNeeds: DIETARY.filter((_, j) => (i + j) % 3 === 0),
    }));
    const slots = Array.from({ length: 40 }, (_, i) =>
      dish(
        i % 5 === 0 ? 'main' : 'side',
        DIETARY.filter((_, j) => (i + j) % 2 === 0),
      ),
    );
    computeCoverage(people, slots); // warm up
    const runs = 50;
    const start = performance.now();
    for (let i = 0; i < runs; i++) computeCoverage(people, slots);
    expect((performance.now() - start) / runs).toBeLessThan(1);
  });
});

describe('topHint', () => {
  it('topHint prefers the need with more guests and targets mains when thin', () => {
    const { participants, slots } = mockupBoard();
    // Nut-free (gap, 1 guest) sorts first, but Vegan (thin, 2 guests) helps more people.
    expect(topHint(computeCoverage(participants, slots))).toEqual({
      need: 'vegan',
      categories: 'main',
    });
  });

  it('topHint targets any slot when the top need is a gap', () => {
    const coverage = computeCoverage(guests(['nut_free'], ['nut_free'], ['vegan']), [
      dish('side', ['vegan']),
    ]);
    expect(topHint(coverage)).toEqual({ need: 'nut_free', categories: 'any' });
  });

  it('topHint is null when everything is ok', () => {
    const coverage = computeCoverage(guests(['halal']), [
      dish('main', ['halal']),
      dish('side', ['halal']),
    ]);
    expect(topHint(coverage)).toBeNull();
    expect(topHint([])).toBeNull();
  });
});

describe('previewCoverage', () => {
  it('previewCoverage shows the vegan main gap closing for a vegan main draft', () => {
    const board = mockupBoard();
    const openMain = board.slots.find((s) => s.category === 'main' && s.claimedBy === null);
    expect(openMain).toBeDefined();
    const changes = previewCoverage(board, {
      slotId: openMain?.id ?? '',
      dishTags: ['vegetarian', 'vegan', 'dairy_free', 'halal'],
    });
    expect(changes).toEqual([{ need: 'vegan', guests: 2, from: 'thin', to: 'ok' }]);
  });

  it('lists every need that gets better, most guests first', () => {
    const board = {
      participants: guests(['nut_free'], ['halal'], ['halal']),
      slots: [dish('side', ['halal']), open('main')],
    };
    const slotId = board.slots[1]?.id ?? '';
    expect(previewCoverage(board, { slotId, dishTags: ['halal', 'nut_free'] })).toEqual([
      { need: 'halal', guests: 2, from: 'thin', to: 'ok' },
      { need: 'nut_free', guests: 1, from: 'gap', to: 'thin' },
    ]);
  });

  it('is empty when the draft changes nothing', () => {
    const board = mockupBoard();
    const openDrink = board.slots.find((s) => s.category === 'drinks' && s.claimedBy === null);
    expect(previewCoverage(board, { slotId: openDrink?.id ?? '', dishTags: [] })).toEqual([]);
  });
});
