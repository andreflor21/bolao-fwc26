import type { BracketFixtureDto, BracketPreviewDto, GroupLetter } from '@bolao/shared';
import { GROUP_LETTERS } from '@bolao/shared';
import { computeStandings } from './group-standings';
import { pickBestThirds, type ThirdPlaceSlot } from './best-third-places';
import {
  ALL_FIXTURES,
  type FixtureTemplate,
  type SlotRef,
} from './fifa-2026-bracket-map';
import type { FifaRanks, GroupMatchResult, GroupStanding } from './types';

export interface BracketEngineInput {
  /** Group-stage match results (any subset; missing matches treated as not yet played). */
  groupMatches: Array<GroupMatchResult & { groupLetter: GroupLetter }>;
  fifaRanks: FifaRanks;
}

interface ResolvedFixture {
  template: FixtureTemplate;
  topTeamCode: string | null;
  bottomTeamCode: string | null;
  predictedWinnerCode: string | null;
  predictedLoserCode: string | null;
}

/**
 * Deterministic predicted winner: lower FIFA rank wins.
 * Returns null if either side is null.
 */
function predictWinner(top: string | null, bottom: string | null, ranks: FifaRanks): string | null {
  if (!top || !bottom) return null;
  const topRank = ranks[top] ?? 9999;
  const bottomRank = ranks[bottom] ?? 9999;
  if (topRank === bottomRank) {
    // Final stable tie-break: alphabetical (deterministic, never null).
    return top < bottom ? top : bottom;
  }
  return topRank < bottomRank ? top : bottom;
}

function resolveSlot(
  slot: SlotRef,
  standingsByGroup: Map<GroupLetter, GroupStanding[]>,
  bestThirds: ThirdPlaceSlot[],
  resolved: Map<string, ResolvedFixture>,
): string | null {
  switch (slot.kind) {
    case 'WINNER_GROUP': {
      const group = standingsByGroup.get(slot.group);
      return group?.[0]?.teamCode ?? null;
    }
    case 'RUNNER_UP_GROUP': {
      const group = standingsByGroup.get(slot.group);
      return group?.[1]?.teamCode ?? null;
    }
    case 'BEST_THIRD': {
      return bestThirds[slot.rank - 1]?.teamCode ?? null;
    }
    case 'WINNER_OF': {
      return resolved.get(slot.fixtureId)?.predictedWinnerCode ?? null;
    }
    case 'LOSER_OF': {
      return resolved.get(slot.fixtureId)?.predictedLoserCode ?? null;
    }
  }
}

/**
 * Builds the full predicted bracket from a set of group match results.
 *
 * For groups with incomplete results (fewer than 6 matches), standings are
 * computed from what's available — slots may resolve to null and predicted
 * winners propagate as null. This lets the engine produce a partial preview
 * while the user is still filling in their guesses.
 *
 * Knockout winners are picked deterministically by FIFA rank (lower wins).
 */
export function buildBracket(input: BracketEngineInput): BracketPreviewDto {
  const { groupMatches, fifaRanks } = input;

  const matchesByGroup = new Map<GroupLetter, GroupMatchResult[]>();
  for (const m of groupMatches) {
    const arr = matchesByGroup.get(m.groupLetter) ?? [];
    arr.push({
      homeTeamCode: m.homeTeamCode,
      awayTeamCode: m.awayTeamCode,
      homeGoals: m.homeGoals,
      awayGoals: m.awayGoals,
    });
    matchesByGroup.set(m.groupLetter, arr);
  }

  const standingsByGroup = new Map<GroupLetter, GroupStanding[]>();
  const groupsForDto: Partial<Record<GroupLetter, GroupStanding[]>> = {};
  for (const letter of GROUP_LETTERS) {
    const matches = matchesByGroup.get(letter) ?? [];
    if (matches.length === 0) continue;
    const standings = computeStandings(letter, matches, fifaRanks);
    standingsByGroup.set(letter, standings);
    groupsForDto[letter] = standings;
  }

  const thirds: GroupStanding[] = [];
  for (const standings of standingsByGroup.values()) {
    const third = standings[2];
    if (third) thirds.push(third);
  }
  let bestThirds: ThirdPlaceSlot[] = [];
  if (thirds.length >= 8) {
    bestThirds = pickBestThirds(thirds);
  }

  const resolved = new Map<string, ResolvedFixture>();
  for (const template of ALL_FIXTURES) {
    const topTeamCode = resolveSlot(template.topSlot, standingsByGroup, bestThirds, resolved);
    const bottomTeamCode = resolveSlot(template.bottomSlot, standingsByGroup, bestThirds, resolved);
    const predictedWinnerCode = predictWinner(topTeamCode, bottomTeamCode, fifaRanks);
    const predictedLoserCode =
      predictedWinnerCode && topTeamCode && bottomTeamCode
        ? predictedWinnerCode === topTeamCode
          ? bottomTeamCode
          : topTeamCode
        : null;
    resolved.set(template.id, {
      template,
      topTeamCode,
      bottomTeamCode,
      predictedWinnerCode,
      predictedLoserCode,
    });
  }

  const fixtures: BracketFixtureDto[] = ALL_FIXTURES.map((tpl) => {
    const r = resolved.get(tpl.id)!;
    return {
      id: tpl.id,
      stage: tpl.stage,
      topSlot: tpl.topSlot,
      bottomSlot: tpl.bottomSlot,
      topTeamCode: r.topTeamCode,
      bottomTeamCode: r.bottomTeamCode,
      predictedWinnerCode: r.predictedWinnerCode,
      predictedLoserCode: r.predictedLoserCode,
    };
  });

  return {
    groups: groupsForDto as BracketPreviewDto['groups'],
    bestThirds: bestThirds.map((t) => ({
      teamCode: t.teamCode,
      groupLetter: t.groupLetter,
      position: t.position,
      played: t.played,
      won: t.won,
      drawn: t.drawn,
      lost: t.lost,
      goalsFor: t.goalsFor,
      goalsAgainst: t.goalsAgainst,
      goalDifference: t.goalDifference,
      points: t.points,
      bestThirdRank: t.bestThirdRank,
    })),
    fixtures,
  };
}
