import { buildBracket, assignThirdsToSlots } from './bracket-engine';
import { GROUP_LETTERS, type GroupLetter, type KnockoutScoreEntryDto } from '@bolao/shared';
import { R32_FIXTURES } from './fifa-2026-bracket-map';
import type { GroupMatchResult } from './types';
import type { ThirdPlaceSlot } from './best-third-places';

function groupTeams(letter: GroupLetter): [string, string, string, string] {
  return [`${letter}1`, `${letter}2`, `${letter}3`, `${letter}4`];
}

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

const FULL_GROUP_RESULTS = (() =>
  GROUP_LETTERS.flatMap((g) =>
    groupRound(g, [[2, 1], [3, 0], [1, 0], [1, 1], [0, 0], [2, 2]]),
  ))();

describe('buildBracket — R32 from group results', () => {
  it('produces 16 R32 fixtures with two resolved teams each', () => {
    const ranks = buildFifaRanks();
    const bracket = buildBracket({ groupMatches: FULL_GROUP_RESULTS, fifaRanks: ranks });

    for (const g of GROUP_LETTERS) expect(bracket.groups[g]).toHaveLength(4);
    expect(bracket.bestThirds).toHaveLength(8);

    const r32 = bracket.fixtures.filter((f) => f.stage === 'r32');
    expect(r32).toHaveLength(16);
    for (const f of r32) {
      expect(f.topTeamCode).not.toBeNull();
      expect(f.bottomTeamCode).not.toBeNull();
    }
  });

  it('exactly 32 distinct teams enter R32', () => {
    const ranks = buildFifaRanks();
    const bracket = buildBracket({ groupMatches: FULL_GROUP_RESULTS, fifaRanks: ranks });
    const teams = new Set<string>();
    for (const f of bracket.fixtures.filter((f) => f.stage === 'r32')) {
      teams.add(f.topTeamCode!);
      teams.add(f.bottomTeamCode!);
    }
    expect(teams.size).toBe(32);
  });

  it('every best-third slot receives a team from its allowedGroups', () => {
    const ranks = buildFifaRanks();
    const bracket = buildBracket({ groupMatches: FULL_GROUP_RESULTS, fifaRanks: ranks });

    for (const tpl of R32_FIXTURES) {
      const f = bracket.fixtures.find((x) => x.id === tpl.id)!;
      if (tpl.topSlot.kind === 'BEST_THIRD_FROM') {
        const group = f.topTeamCode!.charAt(0) as GroupLetter;
        expect(tpl.topSlot.allowedGroups).toContain(group);
      }
      if (tpl.bottomSlot.kind === 'BEST_THIRD_FROM') {
        const group = f.bottomTeamCode!.charAt(0) as GroupLetter;
        expect(tpl.bottomSlot.allowedGroups).toContain(group);
      }
    }
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
    }
  });

  it('without knockout scores, R32 has teams but no predicted winners', () => {
    const ranks = buildFifaRanks();
    const bracket = buildBracket({ groupMatches: FULL_GROUP_RESULTS, fifaRanks: ranks });

    const r32 = bracket.fixtures.filter((f) => f.stage === 'r32');
    for (const f of r32) {
      expect(f.predictedWinnerCode).toBeNull();
      expect(f.predictedLoserCode).toBeNull();
    }

    // R16+ slots are entirely null (no chain upstream).
    const r16 = bracket.fixtures.filter((f) => f.stage === 'r16');
    for (const f of r16) {
      expect(f.topTeamCode).toBeNull();
      expect(f.bottomTeamCode).toBeNull();
    }
    const final = bracket.fixtures.find((f) => f.id === 'F-104');
    expect(final?.topTeamCode).toBeNull();
  });

  it('returns partial bracket gracefully when groups are incomplete', () => {
    const ranks = buildFifaRanks();
    const partial = (['A', 'B', 'C', 'D', 'E', 'F'] as GroupLetter[]).flatMap((g) =>
      groupRound(g, [[1, 0], [2, 0], [1, 0], [0, 0], [1, 1], [2, 2]]),
    );
    const bracket = buildBracket({ groupMatches: partial, fifaRanks: ranks });
    expect(Object.keys(bracket.groups)).toHaveLength(6);
    expect(bracket.bestThirds).toHaveLength(0);
    expect(bracket.fixtures.filter((f) => f.stage === 'r32')).toHaveLength(16);
  });
});

describe('buildBracket — R16+ propagation via knockoutScores', () => {
  function topTeams(): Map<string, string> {
    const ranks = buildFifaRanks();
    const bracket = buildBracket({ groupMatches: FULL_GROUP_RESULTS, fifaRanks: ranks });
    const map = new Map<string, string>();
    for (const f of bracket.fixtures.filter((f) => f.stage === 'r32')) {
      map.set(f.id, f.topTeamCode!);
    }
    return map;
  }

  it('top wins all R32 → R16 slots populated by R32 top teams', () => {
    const ranks = buildFifaRanks();
    const knockoutScores: Record<string, KnockoutScoreEntryDto> = {};
    for (const f of R32_FIXTURES) {
      knockoutScores[f.id] = { homeGoals: 2, awayGoals: 0 };
    }
    const bracket = buildBracket({
      groupMatches: FULL_GROUP_RESULTS,
      fifaRanks: ranks,
      knockoutScores,
    });
    const tops = topTeams();
    for (const f of bracket.fixtures.filter((f) => f.stage === 'r32')) {
      expect(f.predictedWinnerCode).toBe(tops.get(f.id));
    }
    const r16 = bracket.fixtures.find((f) => f.id === 'R16-89')!;
    expect(r16.topTeamCode).toBe(tops.get('R32-74'));
    expect(r16.bottomTeamCode).toBe(tops.get('R32-77'));
  });

  it('a draw without advancesTeamCode blocks downstream resolution', () => {
    const ranks = buildFifaRanks();
    const knockoutScores: Record<string, KnockoutScoreEntryDto> = {};
    for (const f of R32_FIXTURES) {
      knockoutScores[f.id] = { homeGoals: 2, awayGoals: 0 };
    }
    knockoutScores['R32-73'] = { homeGoals: 1, awayGoals: 1 }; // draw, no advances
    const bracket = buildBracket({
      groupMatches: FULL_GROUP_RESULTS,
      fifaRanks: ranks,
      knockoutScores,
    });
    const r32 = bracket.fixtures.find((f) => f.id === 'R32-73')!;
    expect(r32.predictedWinnerCode).toBeNull();
    // R32-73 feeds R16-90 (topSlot) in the official FIFA bracket.
    const r16 = bracket.fixtures.find((f) => f.id === 'R16-90')!;
    expect(r16.topTeamCode).toBeNull(); // chain broken
  });

  it('a draw with advancesTeamCode propagates the chosen team', () => {
    const ranks = buildFifaRanks();
    const tops = topTeams();
    const r32_73_top = tops.get('R32-73')!;
    const knockoutScores: Record<string, KnockoutScoreEntryDto> = {};
    for (const f of R32_FIXTURES) {
      knockoutScores[f.id] = { homeGoals: 2, awayGoals: 0 };
    }
    knockoutScores['R32-73'] = {
      homeGoals: 1,
      awayGoals: 1,
      advancesTeamCode: r32_73_top,
    };
    const bracket = buildBracket({
      groupMatches: FULL_GROUP_RESULTS,
      fifaRanks: ranks,
      knockoutScores,
    });
    const r32 = bracket.fixtures.find((f) => f.id === 'R32-73')!;
    expect(r32.predictedWinnerCode).toBe(r32_73_top);
    // R32-73 feeds R16-90 (topSlot) in the official FIFA bracket.
    const r16 = bracket.fixtures.find((f) => f.id === 'R16-90')!;
    expect(r16.topTeamCode).toBe(r32_73_top);
  });

  it('a full chain of away-wins populates all rounds up to the Final', () => {
    const ranks = buildFifaRanks();
    const knockoutScores: Record<string, KnockoutScoreEntryDto> = {};
    for (const f of [...R32_FIXTURES]) {
      knockoutScores[f.id] = { homeGoals: 0, awayGoals: 3 };
    }
    // For R16+ we don't know the IDs upfront — set away-win for everything.
    for (const id of [
      'R16-89', 'R16-90', 'R16-91', 'R16-92',
      'R16-93', 'R16-94', 'R16-95', 'R16-96',
      'QF-97', 'QF-98', 'QF-99', 'QF-100',
      'SF-101', 'SF-102',
      'F-104', 'TP-103',
    ]) {
      knockoutScores[id] = { homeGoals: 0, awayGoals: 3 };
    }
    const bracket = buildBracket({
      groupMatches: FULL_GROUP_RESULTS,
      fifaRanks: ranks,
      knockoutScores,
    });
    const final = bracket.fixtures.find((f) => f.id === 'F-104')!;
    expect(final.topTeamCode).not.toBeNull();
    expect(final.bottomTeamCode).not.toBeNull();
    expect(final.predictedWinnerCode).toBe(final.bottomTeamCode);

    const tp = bracket.fixtures.find((f) => f.id === 'TP-103')!;
    expect(tp.topTeamCode).not.toBeNull();
    expect(tp.bottomTeamCode).not.toBeNull();
  });

  it('output is deterministic — same inputs produce identical JSON', () => {
    const ranks = buildFifaRanks();
    const knockoutScores: Record<string, KnockoutScoreEntryDto> = {};
    for (const f of R32_FIXTURES) {
      knockoutScores[f.id] = { homeGoals: 2, awayGoals: 1 };
    }
    const a = buildBracket({
      groupMatches: FULL_GROUP_RESULTS,
      fifaRanks: ranks,
      knockoutScores,
    });
    const b = buildBracket({
      groupMatches: FULL_GROUP_RESULTS,
      fifaRanks: ranks,
      knockoutScores,
    });
    expect(JSON.stringify(a)).toBe(JSON.stringify(b));
  });
});

describe('assignThirdsToSlots', () => {
  function third(group: GroupLetter, code: string): ThirdPlaceSlot {
    return {
      teamCode: code,
      groupLetter: group,
      position: 3,
      played: 3, won: 0, drawn: 0, lost: 0,
      goalsFor: 1, goalsAgainst: 1, goalDifference: 0,
      points: 3, fifaRank: 30, bestThirdRank: 1,
    };
  }

  it('respects allowedGroups when assigning', () => {
    const slots = [
      { id: 's1', allowedGroups: ['A', 'B'] as GroupLetter[] },
      { id: 's2', allowedGroups: ['C', 'D'] as GroupLetter[] },
    ];
    const result = assignThirdsToSlots(slots, [third('A', 'A3'), third('C', 'C3')]);
    expect(result.get('s1')).toBe('A3');
    expect(result.get('s2')).toBe('C3');
  });

  it('backtracks when greedy would fail', () => {
    const slots = [
      { id: 's2', allowedGroups: ['A', 'B'] as GroupLetter[] },
      { id: 's1', allowedGroups: ['A'] as GroupLetter[] },
    ];
    const result = assignThirdsToSlots(slots, [third('A', 'A3'), third('B', 'B3')]);
    expect(result.get('s1')).toBe('A3');
    expect(result.get('s2')).toBe('B3');
  });

  it('falls back when no valid matching exists', () => {
    const slots = [
      { id: 's1', allowedGroups: ['X' as GroupLetter] },
      { id: 's2', allowedGroups: ['Y' as GroupLetter] },
    ];
    const result = assignThirdsToSlots(slots, [third('A', 'A3'), third('B', 'B3')]);
    expect(result.size).toBe(2);
  });

  it('produces an empty map when fewer thirds than slots', () => {
    const slots = [
      { id: 's1', allowedGroups: ['A'] as GroupLetter[] },
      { id: 's2', allowedGroups: ['B'] as GroupLetter[] },
    ];
    const result = assignThirdsToSlots(slots, [third('A', 'A3')]);
    expect(result.size).toBe(0);
  });

  it('follows the Annex C table for the full 8-third set (not arbitrary matching)', () => {
    // Combination EFGHIJKL (Annex C Option 1). The bottom slot of each of the
    // 8 winner fixtures is a best-third slot; ids match the real engine.
    const slots = [
      { id: 'R32-74:bottom', allowedGroups: ['A', 'B', 'C', 'D', 'F'] as GroupLetter[] },
      { id: 'R32-77:bottom', allowedGroups: ['C', 'D', 'F', 'G', 'H'] as GroupLetter[] },
      { id: 'R32-79:bottom', allowedGroups: ['C', 'E', 'F', 'H', 'I'] as GroupLetter[] },
      { id: 'R32-80:bottom', allowedGroups: ['E', 'H', 'I', 'J', 'K'] as GroupLetter[] },
      { id: 'R32-81:bottom', allowedGroups: ['B', 'E', 'F', 'I', 'J'] as GroupLetter[] },
      { id: 'R32-82:bottom', allowedGroups: ['A', 'E', 'H', 'I', 'J'] as GroupLetter[] },
      { id: 'R32-85:bottom', allowedGroups: ['E', 'F', 'G', 'I', 'J'] as GroupLetter[] },
      { id: 'R32-87:bottom', allowedGroups: ['D', 'E', 'I', 'J', 'L'] as GroupLetter[] },
    ];
    const thirds = (['E', 'F', 'G', 'H', 'I', 'J', 'K', 'L'] as GroupLetter[]).map((g) =>
      third(g, `${g}3`),
    );
    const result = assignThirdsToSlots(slots, thirds);

    // Regulation-correct allocation (winner group -> third group):
    // E->F, I->G, A->E, L->K, D->I, G->H, B->J, K->L.
    expect(result.get('R32-74:bottom')).toBe('F3'); // 1E faces 3F
    expect(result.get('R32-77:bottom')).toBe('G3'); // 1I faces 3G
    expect(result.get('R32-79:bottom')).toBe('E3'); // 1A faces 3E
    expect(result.get('R32-80:bottom')).toBe('K3'); // 1L faces 3K
    expect(result.get('R32-81:bottom')).toBe('I3'); // 1D faces 3I
    expect(result.get('R32-82:bottom')).toBe('H3'); // 1G faces 3H
    expect(result.get('R32-85:bottom')).toBe('J3'); // 1B faces 3J
    expect(result.get('R32-87:bottom')).toBe('L3'); // 1K faces 3L
  });
});
