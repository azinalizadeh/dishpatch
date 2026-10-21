import { computeCoverage } from '@dishpatch/shared';
import { cleanup, render, screen, within } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';
import { mockupBoard } from '../../../packages/shared/test/fixtures/mockup-board.ts';
import { CoverageMeter } from '../src/components/CoverageMeter.tsx';
import { coverageSummary, previewText } from '../src/coverage-copy.ts';

const { participants, slots } = mockupBoard();
const coverage = computeCoverage(participants, slots);

describe('CoverageMeter', () => {
  afterEach(cleanup);

  it('status is shown as text, not only colour', () => {
    render(<CoverageMeter coverage={coverage} variant="full" />);
    const rows = within(screen.getByRole('list', { name: 'Dietary needs' })).getAllByRole(
      'listitem',
    );
    expect(rows.map((row) => row.textContent)).toEqual([
      'Nut-free1 guest needs it · 0 dishes fitNothing yet',
      'Vegan2 guests need it · 2 dishes fitNo vegan main yet',
      'Halal2 guests need it · 3 dishes fitCovered',
      'Gluten-free1 guest needs it · 5 dishes fitCovered',
    ]);
  });

  it('renders the empty state when no guest has needs', () => {
    render(<CoverageMeter coverage={[]} variant="full" />);
    expect(screen.getByText(/No one has listed dietary needs yet/)).toBeTruthy();
    expect(screen.queryByRole('list')).toBeNull();
  });

  it('bar has role img with an accessible label', () => {
    render(<CoverageMeter coverage={coverage} variant="compact" />);
    expect(screen.getByRole('img', { name: 'Vegan: 2 compatible dishes' })).toBeTruthy();
    expect(screen.getByRole('img', { name: 'Nut-free: 0 compatible dishes' })).toBeTruthy();
  });

  it('shows skeleton rows while the board loads', () => {
    render(<CoverageMeter coverage={undefined} variant="full" />);
    expect(screen.getByRole('status', { name: 'Loading dietary coverage' })).toBeTruthy();
  });
});

describe('coverage copy', () => {
  it('summarises what is missing, most guests first', () => {
    expect(coverageSummary(coverage)).toBe('No vegan main yet · nut-free: nothing yet');
    expect(coverageSummary(coverage.filter((row) => row.status === 'ok'))).toBeNull();
  });

  it('describes a thin need with one main and the preview banners', () => {
    expect(
      coverageSummary([{ need: 'halal', guests: 1, dishes: 1, mains: 1, status: 'thin' }]),
    ).toBe('Halal: just one dish so far');
    const change = { need: 'vegan', guests: 2, from: 'thin', to: 'ok', mainsBefore: 0 } as const;
    expect(previewText(change)).toBe('This covers the vegan main gap for 2 guests.');
    // Thin only because it had one dish, already a main: no main gap to close.
    expect(previewText({ ...change, mainsBefore: 1 })).toBe('This covers vegan for 2 guests.');
    expect(
      previewText({ need: 'nut_free', guests: 1, from: 'gap', to: 'thin', mainsBefore: 0 }),
    ).toBe('This is the first nut-free dish, for 1 guest.');
  });
});
