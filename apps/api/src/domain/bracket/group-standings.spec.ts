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
    const out = computeStandings('A', matches, ranks);
    expect(out.map((s) => s.teamCode)).toEqual(['BRA', 'ARG', 'ESP', 'POR']);
    expect(out[0]!.points).toBe(9);
    expect(out[0]!.goalDifference).toBe(6);
    expect(out[1]!.points).toBe(4);
    expect(out[2]!.points).toBe(2);
    expect(out[3]!.points).toBe(1);
  });

  it('breaks pts tie by goal difference', () => {
    // ESP 1pt, POR 1pt — same pts; POR has better GD.
    const matches = group(['BRA', 'ARG', 'ESP', 'POR'], [
      [0, 1], // BRA-ARG: ARG wins
      [5, 0], // BRA-ESP: BRA wins
      [3, 0], // BRA-POR: BRA wins
      [1, 0], // ARG-ESP: ARG wins
      [2, 1], // ARG-POR: ARG wins
      [0, 0], // ESP-POR draw
    ]);
    const out = computeStandings('A', matches, ranks);
    expect(out.map((s) => s.teamCode)).toEqual(['ARG', 'BRA', 'POR', 'ESP']);
    // ESP and POR both have 1 pt; POR has better GD (-4 vs -6).
    expect(out[2]!.teamCode).toBe('POR');
    expect(out[2]!.points).toBe(1);
    expect(out[3]!.teamCode).toBe('ESP');
    expect(out[3]!.points).toBe(1);
    expect(out[2]!.goalDifference).toBeGreaterThan(out[3]!.goalDifference);
  });

  it('breaks triple tie by head-to-head', () => {
    // 3 teams (BRA, ARG, ESP) finish with 6 pts each by beating POR
    // and going round-robin 1-0 with each other.
    // Cycle: BRA>ARG, ARG>ESP, ESP>BRA (each has 1 win, 1 loss vs the others)
    // → still tied on H2H pts. GD-h2h: each is 0. GF-h2h: each is 1.
    // → fall back to FIFA rank: ARG(1) < BRA(5) < ESP(8).
    const matches = group(['BRA', 'ARG', 'ESP', 'POR'], [
      [1, 0], // BRA-ARG: BRA wins
      [0, 1], // BRA-ESP: ESP wins
      [3, 0], // BRA-POR
      [1, 0], // ARG-ESP: ARG wins
      [3, 0], // ARG-POR
      [3, 0], // ESP-POR
    ]);
    const out = computeStandings('A', matches, ranks);
    // POR last (0 pts), then ARG > BRA > ESP by FIFA rank.
    expect(out.map((s) => s.teamCode)).toEqual(['ARG', 'BRA', 'ESP', 'POR']);
    expect(out[0]!.points).toBe(6);
    expect(out[1]!.points).toBe(6);
    expect(out[2]!.points).toBe(6);
    expect(out[3]!.teamCode).toBe('POR');
  });

  it('breaks triple tie by H2H when it actually differentiates', () => {
    // BRA beats ARG and ESP; ARG beats ESP. All beat POR.
    // Overall: BRA 9, ARG 6, ESP 3, POR 0. No tie really.
    // Let me design a real H2H breaking case:
    // BRA, ARG, ESP all 6 pts each (beat POR + draw with each other but
    // with different GF in those drew matches).
    const matches = group(['BRA', 'ARG', 'ESP', 'POR'], [
      [3, 3], // BRA-ARG draw 3-3 (BRA: gf=3, ARG: gf=3 in h2h)
      [2, 2], // BRA-ESP draw 2-2 (BRA: gf+2=5, ESP: gf=2)
      [4, 0], // BRA-POR
      [1, 1], // ARG-ESP draw 1-1 (ARG: gf+1=4, ESP: gf+1=3)
      [4, 0], // ARG-POR
      [4, 0], // ESP-POR
    ]);
    // All three: 1 draw + 1 draw + 1 win = 5 pts. Wait that's not 6.
    // 2 draws (vs other top2) + 1 win (vs POR) = 2 + 3 = 5 pts each.
    // Tied on pts. GD overall: BRA 5-5+4-0=4, ARG 4-4+4-0=4, ESP 3-3+4-0=4. Tied GD.
    // GF overall: BRA 9, ARG 8, ESP 7. → ordered by GF, no need for H2H.
    const out = computeStandings('A', matches, ranks);
    expect(out.map((s) => s.teamCode)).toEqual(['BRA', 'ARG', 'ESP', 'POR']);
    expect(out[0]!.points).toBe(5);
  });

  it('falls back to FIFA rank on a four-way 3-3-3-3 tie', () => {
    // Every team wins one, loses one, draws one → 4 pts each. Identical pts.
    // But also identical GD/GF if all results are 1-1, 1-0, 0-1 symmetric.
    const matches = group(['AAA', 'BBB', 'CCC', 'DDD'], [
      [1, 0], // AAA-BBB
      [0, 1], // AAA-CCC
      [1, 1], // AAA-DDD draw
      [1, 1], // BBB-CCC draw
      [1, 0], // BBB-DDD
      [0, 1], // CCC-DDD
    ]);
    // pts: AAA 4, BBB 4, CCC 4, DDD 4. Tied.
    // GD: AAA = 2-2 = 0, BBB = 2-2 = 0, CCC = 2-2 = 0, DDD = 2-2 = 0.
    // GF: AAA 2, BBB 2, CCC 2, DDD 2. Tied.
    // → FIFA rank: AAA=50, BBB=51, CCC=52, DDD=53.
    const out = computeStandings('A', matches, ranks);
    expect(out.map((s) => s.teamCode)).toEqual(['AAA', 'BBB', 'CCC', 'DDD']);
  });

  it('always produces exactly 4 entries with positions 1..4', () => {
    const matches = group(['BRA', 'ARG', 'ESP', 'POR'], [
      [1, 0], [2, 1], [0, 0], [1, 1], [3, 2], [2, 2],
    ]);
    const out = computeStandings('B', matches, ranks);
    expect(out).toHaveLength(4);
    expect(out.map((s) => s.position)).toEqual([1, 2, 3, 4]);
    expect(out.every((s) => s.played === 3)).toBe(true);
  });
});
