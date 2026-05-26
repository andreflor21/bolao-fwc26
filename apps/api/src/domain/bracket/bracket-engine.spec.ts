import { buildBracket } from './bracket-engine';
import { GROUP_LETTERS, type GroupLetter } from '@bolao/shared';
import type { GroupMatchResult } from './types';

/** Build the 4 teams of a group with deterministic codes. */
function groupTeams(letter: GroupLetter): [string, string, string, string] {
  return [`${letter}1`, `${letter}2`, `${letter}3`, `${letter}4`];
}

/** Build 6 round-robin matches for one group with given score pairs. */
function groupRound(
  letter: GroupLetter,
  scores: [number, number][],
): Array<GroupMatchResult & { groupLetter: GroupLetter }> {
  const [a, b, c, d] = groupTeams(letter);
  const fixtures: [string, string][] = [
    [a, b], [a, c], [a, d], [b, c], [b, d], [c, d],
  ];
  return fixtures.map(([home, away], i) => ({
    groupLetter: letter,
    homeTeamCode: home,
    awayTeamCode: away,
    homeGoals: scores[i]![0],
    awayGoals: scores[i]![1],
  }));
}

/** Mulberry32 PRNG — deterministic seeded random. */
function rng(seed: number) {
  let s = seed >>> 0;
  return () => {
    s = (s + 0x6D2B79F5) >>> 0;
    let t = s;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function randomScores(rand: () => number): [number, number][] {
  return Array.from({ length: 6 }, () => [
    Math.floor(rand() * 5),
    Math.floor(rand() * 5),
  ] as [number, number]);
}

function buildFifaRanks(): Record<string, number> {
  const ranks: Record<string, number> = {};
  let r = 1;
  for (const letter of GROUP_LETTERS) {
    for (const team of groupTeams(letter)) {
      ranks[team] = r++;
    }
  }
  return ranks;
}

describe('buildBracket', () => {
  it('produces a valid 32-fixture knockout bracket from full group results', () => {
    const ranks = buildFifaRanks();
    const allMatches = GROUP_LETTERS.flatMap((g) =>
      groupRound(g, [[2, 1], [3, 0], [1, 0], [1, 1], [0, 0], [2, 2]]),
    );
    const bracket = buildBracket({ groupMatches: allMatches, fifaRanks: ranks });

    // All 12 groups present, 4 entries each.
    for (const g of GROUP_LETTERS) {
      expect(bracket.groups[g]).toHaveLength(4);
    }

    // 8 best thirds.
    expect(bracket.bestThirds).toHaveLength(8);
    expect(bracket.bestThirds.map((b) => b.bestThirdRank)).toEqual([1, 2, 3, 4, 5, 6, 7, 8]);

    // Knockout topology: 16 R32 + 8 R16 + 4 QF + 2 SF + Final + 3rd-place = 32.
    expect(bracket.fixtures).toHaveLength(32);
    const stageCounts = bracket.fixtures.reduce<Record<string, number>>((acc, f) => {
      acc[f.stage] = (acc[f.stage] ?? 0) + 1;
      return acc;
    }, {});
    expect(stageCounts).toEqual({ r32: 16, r16: 8, qf: 4, sf: 2, final: 1, tp: 1 });

    // Every R32 slot resolves to a non-null team code.
    const r32 = bracket.fixtures.filter((f) => f.stage === 'r32');
    for (const f of r32) {
      expect(f.topTeamCode).not.toBeNull();
      expect(f.bottomTeamCode).not.toBeNull();
      expect(f.predictedWinnerCode).not.toBeNull();
    }

    // Final has a champion.
    const final = bracket.fixtures.find((f) => f.id === 'FINAL');
    expect(final?.predictedWinnerCode).not.toBeNull();
    expect(final?.predictedLoserCode).not.toBeNull();

    // 3rd-place match has two teams.
    const tp = bracket.fixtures.find((f) => f.id === 'TP');
    expect(tp?.topTeamCode).not.toBeNull();
    expect(tp?.bottomTeamCode).not.toBeNull();
    expect(tp?.predictedWinnerCode).not.toBeNull();
  });

  it('exactly 32 distinct teams enter R32', () => {
    const ranks = buildFifaRanks();
    const allMatches = GROUP_LETTERS.flatMap((g) =>
      groupRound(g, [[2, 1], [3, 0], [1, 0], [1, 1], [0, 0], [2, 2]]),
    );
    const bracket = buildBracket({ groupMatches: allMatches, fifaRanks: ranks });
    const r32 = bracket.fixtures.filter((f) => f.stage === 'r32');
    const teams = new Set<string>();
    for (const f of r32) {
      teams.add(f.topTeamCode!);
      teams.add(f.bottomTeamCode!);
    }
    expect(teams.size).toBe(32);
  });

  it('returns partial bracket gracefully when groups are incomplete', () => {
    const ranks = buildFifaRanks();
    // Only 6 of 12 groups have results.
    const partial = (['A','B','C','D','E','F'] as GroupLetter[]).flatMap((g) =>
      groupRound(g, [[1, 0], [2, 0], [1, 0], [0, 0], [1, 1], [2, 2]]),
    );
    const bracket = buildBracket({ groupMatches: partial, fifaRanks: ranks });
    expect(Object.keys(bracket.groups)).toHaveLength(6);
    expect(bracket.bestThirds).toHaveLength(0); // fewer than 8 thirds available
    // R32 still has 16 fixtures but with null slots where data is missing.
    expect(bracket.fixtures.filter((f) => f.stage === 'r32')).toHaveLength(16);
    const final = bracket.fixtures.find((f) => f.id === 'FINAL');
    expect(final?.predictedWinnerCode).toBeNull();
  });

  it('1000 random tournaments always produce a valid 32-team R32', () => {
    const ranks = buildFifaRanks();
    for (let seed = 0; seed < 1000; seed++) {
      const rand = rng(seed);
      const allMatches = GROUP_LETTERS.flatMap((g) => groupRound(g, randomScores(rand)));
      const bracket = buildBracket({ groupMatches: allMatches, fifaRanks: ranks });

      const r32 = bracket.fixtures.filter((f) => f.stage === 'r32');
      expect(r32).toHaveLength(16);
      const teams = new Set<string>();
      for (const f of r32) {
        expect(f.topTeamCode).not.toBeNull();
        expect(f.bottomTeamCode).not.toBeNull();
        teams.add(f.topTeamCode!);
        teams.add(f.bottomTeamCode!);
      }
      expect(teams.size).toBe(32);

      const final = bracket.fixtures.find((f) => f.id === 'FINAL');
      expect(final?.predictedWinnerCode).not.toBeNull();
    }
  });

  it('predicted winner is deterministic — re-running yields identical output', () => {
    const ranks = buildFifaRanks();
    const allMatches = GROUP_LETTERS.flatMap((g) =>
      groupRound(g, [[1, 2], [0, 3], [2, 0], [1, 1], [0, 1], [3, 1]]),
    );
    const a = buildBracket({ groupMatches: allMatches, fifaRanks: ranks });
    const b = buildBracket({ groupMatches: allMatches, fifaRanks: ranks });
    expect(JSON.stringify(a)).toBe(JSON.stringify(b));
  });
});
