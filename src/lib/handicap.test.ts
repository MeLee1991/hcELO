import { describe, expect, it } from 'vitest';
import { calculateElo, enforceMinimumTier, evaluateMonthlyTier, expectedOutcome, tournamentPointsForPlacement } from './handicap';

describe('Elo handicap calculations', () => {
  it('calculates expected outcome with the standard Elo formula', () => {
    expect(expectedOutcome(1500, 1500)).toBeCloseTo(0.5, 5);
    expect(expectedOutcome(1600, 1500)).toBeCloseTo(0.64006, 5);
  });

  it('updates both ratings symmetrically with K=20 by default', () => {
    const result = calculateElo(1500, 1500, 'A');

    expect(result.newRatingA).toBe(1510);
    expect(result.newRatingB).toBe(1490);
    expect(result.deltaA).toBe(10);
    expect(result.deltaB).toBe(-10);
  });

  it('supports an editable K factor', () => {
    const result = calculateElo(1500, 1500, 'A', 10);

    expect(result.newRatingA).toBe(1505);
    expect(result.newRatingB).toBe(1495);
  });

  it('rewards upsets more than expected wins', () => {
    const result = calculateElo(1400, 1700, 'A');

    expect(result.deltaA).toBeGreaterThan(16);
    expect(result.deltaB).toBeLessThan(-16);
  });
});

describe('monthly hysteresis', () => {
  it('promotes only after crossing the next tier baseline', () => {
    expect(evaluateMonthlyTier('A3', 1599.99)).toBe('A3');
    expect(evaluateMonthlyTier('A3', 1600)).toBe('A2');
  });

  it('demotes only after dropping strictly below the 50 point buffer', () => {
    expect(evaluateMonthlyTier('A2', 1550)).toBe('A2');
    expect(evaluateMonthlyTier('A2', 1549.99)).toBe('A3');
  });

  it('can promote across multiple tiers when rating warrants it', () => {
    expect(evaluateMonthlyTier('B2', 1710)).toBe('A1');
  });

  it('prevents monthly processing from going below miniHC', () => {
    expect(enforceMinimumTier('B2', 'A3')).toBe('A3');
    expect(enforceMinimumTier('A2', 'A3')).toBe('A2');
  });
});

describe('tournament points', () => {
  it('allocates points only to top four positions', () => {
    expect(tournamentPointsForPlacement(1)).toBe(100);
    expect(tournamentPointsForPlacement(2)).toBe(70);
    expect(tournamentPointsForPlacement(3)).toBe(50);
    expect(tournamentPointsForPlacement(5)).toBe(0);
  });
});
