import type { GroupStanding } from './types';

export interface ThirdPlaceSlot extends GroupStanding {
  /** 1-based rank among the qualifying 8 best third-placed teams. */
  bestThirdRank: 1 | 2 | 3 | 4 | 5 | 6 | 7 | 8;
}

/**
 * Picks the 8 best third-placed teams out of the 12 group thirds.
 * Cascade (no head-to-head — these teams come from different groups):
 *
 *   1. Points
 *   2. Goal difference
 *   3. Goals scored
 *   4. FIFA rank (lower = better) as deterministic auxiliary tie-break.
 *
 * Throws if fewer than 8 third-place candidates are supplied — by FIFA rules
 * the tournament always feeds 8 thirds into the R32.
 */
export function pickBestThirds(thirds: GroupStanding[]): ThirdPlaceSlot[] {
  if (thirds.length < 8) {
    throw new Error(`pickBestThirds: expected ≥ 8 third-place teams, got ${thirds.length}`);
  }

  const sorted = [...thirds].sort((a, b) => {
    if (b.points !== a.points) return b.points - a.points;
    if (b.goalDifference !== a.goalDifference) return b.goalDifference - a.goalDifference;
    if (b.goalsFor !== a.goalsFor) return b.goalsFor - a.goalsFor;
    return a.fifaRank - b.fifaRank;
  });

  return sorted.slice(0, 8).map((s, idx) => ({
    ...s,
    bestThirdRank: (idx + 1) as ThirdPlaceSlot['bestThirdRank'],
  }));
}
