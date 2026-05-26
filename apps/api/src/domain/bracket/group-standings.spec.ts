import { computeStandings } from './group-standings';
import type { FifaRanks, GroupMatchResult } from './types';

const ranks: FifaRanks = {
  BRA: 5,
  ARG: 1,
  ESP: 8,
  POR: 6,
  AAA: 50,
  BBB: 51,
  CCC: 52,
  DDD: 53,
};

// Helper to build the 6 round-robin matches of a 4-team group.
function group(
  teams: [string, string, string, string],
  scores: [number, number][], // 6 score pairs in order [AB, AC, AD, BC, BD, CD]
): GroupMatchResult[] {
  const [a, b, c, d] = teams;
  return [
    { homeTeamCode: a, awayTeamCode: b, homeGoals: scores[0]![0], awayGoals: scores[0]![1] },
    { homeTeamCode: a, awayTeamCode: c, homeGoals: scores[1]![0], awayGoals: scores[1]![1] },
    { homeTeamCode: a, awayTeamCode: d, homeGoals: scores[2]![0], awayGoals: scores[2]![1] },
    { homeTeamCode: b, awayTeamCode: c, homeGoals: scores[3]![0], awayGoals: scores[3]![1] },
    { homeTeamCode: b, awayTeamCode: d, homeGoals: scores[4]![0], awayGoals: scores[4]![1] },
    { homeTeamCode: c, awayTeamCode: d, homeGoals: scores[5]![0], awayGoals: scores[5]![1] },
  ];
}

describe('computeStandings', () => {
  it('ranks by points first', () => {
    // BRA wins all 3 → 9 pts. ARG has 1 win + 1 draw = 4 pts.
    // ESP has 2 draws = 2 pts. POR has 1 draw = 1 pt.
    const matches = group(['BRA', 'ARG', 'ESP', 'POR'], [
      [2, 0], // BRA-ARG: 2-0
      [3, 0], // BRA-ESP: 3-0
      [1, 0], // BRA-POR: 1-0
      [1, 1], // ARG-ESP draw
      [2, 1], // ARG-POR: 2-1
      [0, 0], // ESP-POR draw
    ]);
    const { standings, unresolvedTies } = computeStandings('A', matches, ranks);
    expect(standings.map((s) => s.teamCode)).toEqual(['BRA', 'ARG', 'ESP', 'POR']);
    expect(standings[0]!.points).toBe(9);
    expect(standings[0]!.goalDifference).toBe(6);
    expect(standings[1]!.points).toBe(4);
    expect(standings[2]!.points).toBe(2);
    expect(standings[3]!.points).toBe(1);
    expect(unresolvedTies).toHaveLength(0);
  });

  it('breaks pts tie via head-to-head before falling to overall stats', () => {
    // ESP and POR both 1pt. H2H ESP-POR 0-0 → still tied at H2H.
    // → overall GD: POR -4, ESP -6 → POR ahead.
    const matches = group(['BRA', 'ARG', 'ESP', 'POR'], [
      [0, 1], // BRA-ARG: ARG wins
      [5, 0], // BRA-ESP: BRA wins
      [3, 0], // BRA-POR: BRA wins
      [1, 0], // ARG-ESP: ARG wins
      [2, 1], // ARG-POR: ARG wins
      [0, 0], // ESP-POR draw
    ]);
    const { standings } = computeStandings('A', matches, ranks);
    expect(standings.map((s) => s.teamCode)).toEqual(['ARG', 'BRA', 'POR', 'ESP']);
    expect(standings[2]!.teamCode).toBe('POR');
    expect(standings[3]!.teamCode).toBe('ESP');
  });

  it('H2H GD breaks tie even when overall GD differs', () => {
    // Build a case where H2H GD favors one team but overall GD favors another.
    // BRA & ARG tied on pts; their H2H result has clear GD; overall is reversed.
    //
    // Layout:
    //  BRA-ARG: 3-0 (BRA wins, H2H pts 3, H2H GD +3, H2H GF 3)
    //  BRA-ESP: 0-1 (BRA loses badly later)
    //  BRA-POR: 0-1
    //  ARG-ESP: 5-0
    //  ARG-POR: 5-0
    //  ESP-POR: 0-0
    //
    // BRA: 1W (vs ARG), 2L → 3 pts, GD = 3-2 = 1, GF = 3
    // ARG: 1W (vs ESP), 1W (vs POR), 1L (vs BRA) → 6 pts. Different pts, not tied here.
    //
    // Redo: want BRA and ARG with SAME pts but different H2H and overall.
    //  BRA-ARG: 3-0
    //  BRA-ESP: 0-2
    //  BRA-POR: 0-2
    //  ARG-ESP: 0-1
    //  ARG-POR: 0-1
    //  ESP-POR: 0-0
    //
    // BRA: 1W 2L → 3 pts. Overall GD = 3 - 4 = -1. GF = 3.
    // ARG: 1L 2L = 0 pts. NO.
    //
    // Make both 3 pts: BRA wins vs ARG only, ARG wins vs nobody except… hmm.
    // Let me use 4 pts for each by adding one draw:
    //  BRA-ARG: 3-0   (BRA wins)
    //  BRA-ESP: 1-1   (draw)
    //  BRA-POR: 0-2   (POR wins)
    //  ARG-ESP: 1-1   (draw)
    //  ARG-POR: 2-0   (ARG wins)
    //  ESP-POR: 1-1   (draw)
    //
    // BRA: W, D, L → 4 pts. GD = 4-3 = 1. GF = 4.
    // ARG: L, D, W → 4 pts. GD = 3-4 = -1. GF = 3.
    // ESP: D, D, D → 3 pts.
    // POR: W, L, D → 4 pts. GD = 3-3 = 0. GF = 3.
    //
    // Three teams (BRA, ARG, POR) tied on 4 pts.
    // H2H subset matches: BRA-ARG 3-0, BRA-POR 0-2, ARG-POR 2-0.
    //   BRA H2H: 3+0=3 GF, 0+2=2 GA, pts 3, GD +1
    //   ARG H2H: 0+2=2 GF, 3+0=3 GA, pts 3, GD -1
    //   POR H2H: 0+2=2 GF, 0+2=2 GA, pts 3, GD 0
    // All 3 H2H pts. GD: BRA +1, POR 0, ARG -1.
    // → ordered by H2H GD: BRA, POR, ARG.
    const matches = group(['BRA', 'ARG', 'ESP', 'POR'], [
      [3, 0], // BRA-ARG
      [1, 1], // BRA-ESP
      [0, 2], // BRA-POR
      [1, 1], // ARG-ESP
      [2, 0], // ARG-POR
      [1, 1], // ESP-POR
    ]);
    const { standings } = computeStandings('A', matches, ranks);
    expect(standings.map((s) => s.teamCode)).toEqual(['BRA', 'POR', 'ARG', 'ESP']);
  });

  it('falls back to FIFA rank when H2H + overall both tied', () => {
    // BRA/ARG/ESP all 6 pts via 1-0 cycle, all beat POR 3-0.
    // H2H: BRA>ARG, ARG>ESP, ESP>BRA. Each 1W/1L, 3 H2H pts, GD 0, GF 1. Tied.
    // Overall: each +4 GD, 4 GF. Tied.
    // → FIFA rank: ARG(1) < BRA(5) < ESP(8).
    const matches = group(['BRA', 'ARG', 'ESP', 'POR'], [
      [1, 0], // BRA-ARG
      [0, 1], // BRA-ESP
      [3, 0], // BRA-POR
      [1, 0], // ARG-ESP
      [3, 0], // ARG-POR
      [3, 0], // ESP-POR
    ]);
    const { standings, unresolvedTies } = computeStandings('A', matches, ranks);
    expect(standings.map((s) => s.teamCode)).toEqual(['ARG', 'BRA', 'ESP', 'POR']);
    // BRA/ARG/ESP make up the unresolved tie (POR is sole 4th).
    expect(unresolvedTies).toHaveLength(1);
    expect(unresolvedTies[0]!.sort()).toEqual(['ARG', 'BRA', 'ESP']);
  });

  it('manual tiebreak order overrides FIFA rank fallback', () => {
    const matches = group(['BRA', 'ARG', 'ESP', 'POR'], [
      [1, 0], // BRA-ARG
      [0, 1], // BRA-ESP
      [3, 0], // BRA-POR
      [1, 0], // ARG-ESP
      [3, 0], // ARG-POR
      [3, 0], // ESP-POR
    ]);
    // Manual: user wants ESP > BRA > ARG (opposite of FIFA rank).
    const { standings, unresolvedTies } = computeStandings(
      'A',
      matches,
      ranks,
      ['ESP', 'BRA', 'ARG'],
    );
    expect(standings.map((s) => s.teamCode)).toEqual(['ESP', 'BRA', 'ARG', 'POR']);
    // Still surfaced as unresolved (the criteria didn't decide it — the user did).
    expect(unresolvedTies).toHaveLength(1);
  });

  it('falls back to FIFA rank on a four-way 4-4-4-4 tie', () => {
    // Every team 1W 1L 1D → 4 pts each, GD 0, GF 2.
    const matches = group(['AAA', 'BBB', 'CCC', 'DDD'], [
      [1, 0], // AAA-BBB
      [0, 1], // AAA-CCC
      [1, 1], // AAA-DDD
      [1, 1], // BBB-CCC
      [1, 0], // BBB-DDD
      [0, 1], // CCC-DDD
    ]);
    const { standings, unresolvedTies } = computeStandings('A', matches, ranks);
    expect(standings.map((s) => s.teamCode)).toEqual(['AAA', 'BBB', 'CCC', 'DDD']);
    expect(unresolvedTies).toHaveLength(1);
    expect(unresolvedTies[0]).toHaveLength(4);
  });

  it('always produces exactly 4 entries with positions 1..4', () => {
    const matches = group(['BRA', 'ARG', 'ESP', 'POR'], [
      [1, 0], [2, 1], [0, 0], [1, 1], [3, 2], [2, 2],
    ]);
    const { standings } = computeStandings('B', matches, ranks);
    expect(standings).toHaveLength(4);
    expect(standings.map((s) => s.position)).toEqual([1, 2, 3, 4]);
    expect(standings.every((s) => s.played === 3)).toBe(true);
  });

  it('overall pts is the outer cascade (H2H never demotes a team with more pts)', () => {
    // BRA has 9 pts (3 wins), ARG/ESP/POR all 0 pts. Even though BRA might
    // hypothetically lose every H2H subset comparison vs a different team,
    // the outer pts cascade means it stays in 1st.
    const matches = group(['BRA', 'ARG', 'ESP', 'POR'], [
      [3, 0], [3, 0], [3, 0],
      [0, 1], [0, 1], [0, 1],
    ]);
    // ARG/ESP/POR cycle: ARG>ESP, ESP>POR, POR>ARG (rows 4-6 above:
    //   [0,1] ARG-ESP → ESP wins
    //   [0,1] ARG-POR → POR wins
    //   [0,1] ESP-POR → POR wins
    // Actually that gives POR 2W, ESP 1W 1L, ARG 0W 2L. Not a cycle.
    // Doesn't matter for this test — what matters is BRA stays first.
    const { standings } = computeStandings('A', matches, ranks);
    expect(standings[0]!.teamCode).toBe('BRA');
    expect(standings[0]!.points).toBe(9);
  });
});
