import type {
  BracketFixtureDto,
  BracketPreviewDto,
  GroupLetter,
  KnockoutScoreEntryDto,
} from '@bolao/shared';
import { GROUP_LETTERS } from '@bolao/shared';
import { computeStandings } from './group-standings';
import { pickBestThirds, type ThirdPlaceSlot } from './best-third-places';
import {
  ALL_FIXTURES,
  R32_FIXTURES,
  type FixtureTemplate,
  type SlotRef,
} from './fifa-2026-bracket-map';
import type { FifaRanks, GroupMatchResult, GroupStanding } from './types';

export interface BracketEngineInput {
  /** Group-stage match results (any subset; missing matches treated as not yet played). */
  groupMatches: Array<GroupMatchResult & { groupLetter: GroupLetter }>;
  fifaRanks: FifaRanks;
  /**
   * Per-fixture knockout score predictions, keyed by fixtureId. The engine
   * uses these to derive winners/losers and propagate teams downstream.
   * Omitted: R16+ slots resolve to null until the player fills R32 scores.
   */
  knockoutScores?: Record<string, KnockoutScoreEntryDto>;
}

interface ResolvedFixture {
  template: FixtureTemplate;
  topTeamCode: string | null;
  bottomTeamCode: string | null;
  predictedWinnerCode: string | null;
  predictedLoserCode: string | null;
}

/**
 * Returns the predicted winner of a fixture based on the player's score
 * for it. Null when either team isn't resolved yet, or when the score
 * is a draw and the player hasn't declared who advances.
 */
function deriveWinnerFromScore(
  topTeamCode: string | null,
  bottomTeamCode: string | null,
  score: KnockoutScoreEntryDto | undefined,
): { winner: string | null; loser: string | null } {
  if (!topTeamCode || !bottomTeamCode || !score) {
    return { winner: null, loser: null };
  }
  if (score.homeGoals > score.awayGoals) {
    return { winner: topTeamCode, loser: bottomTeamCode };
  }
  if (score.awayGoals > score.homeGoals) {
    return { winner: bottomTeamCode, loser: topTeamCode };
  }
  // Draw — player must declare advancesTeamCode.
  const advances = score.advancesTeamCode;
  if (advances === topTeamCode) {
    return { winner: topTeamCode, loser: bottomTeamCode };
  }
  if (advances === bottomTeamCode) {
    return { winner: bottomTeamCode, loser: topTeamCode };
  }
  return { winner: null, loser: null };
}

/**
 * Assigns each of the 8 advancing thirds to exactly one BEST_THIRD_FROM
 * R32 slot, respecting per-slot allowed-groups constraints. Uses
 * backtracking — fast for n=8 (worst case 8! × 8 = 322k ops).
 *
 * Returns a map slotId → teamCode. If no valid bipartite matching exists
 * (impossible under FIFA design but defensive nonetheless), falls back to
 * a greedy assignment ignoring constraints.
 */
export function assignThirdsToSlots(
  slots: Array<{ id: string; allowedGroups: GroupLetter[] }>,
  thirds: ThirdPlaceSlot[],
): Map<string, string> {
  const result = new Map<string, string>();
  if (thirds.length < slots.length) return result;

  const used = new Array<boolean>(thirds.length).fill(false);
  const assignment = new Array<number>(slots.length).fill(-1);

  function backtrack(slotIdx: number): boolean {
    if (slotIdx === slots.length) return true;
    const allowed = slots[slotIdx]!.allowedGroups;
    for (let i = 0; i < thirds.length; i++) {
      if (used[i]) continue;
      if (!allowed.includes(thirds[i]!.groupLetter)) continue;
      used[i] = true;
      assignment[slotIdx] = i;
      if (backtrack(slotIdx + 1)) return true;
      used[i] = false;
      assignment[slotIdx] = -1;
    }
    return false;
  }

  if (backtrack(0)) {
    for (let i = 0; i < slots.length; i++) {
      result.set(slots[i]!.id, thirds[assignment[i]!]!.teamCode);
    }
    return result;
  }

  for (let i = 0; i < slots.length; i++) {
    result.set(slots[i]!.id, thirds[i]!.teamCode);
  }
  return result;
}

function resolveSlot(
  slot: SlotRef,
  standingsByGroup: Map<GroupLetter, GroupStanding[]>,
  thirdBySlotId: Map<string, string>,
  resolved: Map<string, ResolvedFixture>,
  ownFixtureId: string,
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
    case 'BEST_THIRD_FROM': {
      return thirdBySlotId.get(ownFixtureId) ?? null;
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
 * Builds the predicted bracket from group results + the player's per-fixture
 * knockout score predictions.
 *
 *   1. Group standings → R32 teams (from WINNER_GROUP / RUNNER_UP_GROUP /
 *      BEST_THIRD_FROM slots with bipartite assignment of the 8 thirds).
 *   2. R32 winner = derived from the player's score for that fixture (draws
 *      require an explicit advancesTeamCode).
 *   3. R16 teams come from WINNER_OF previous R32 fixtures, and so on
 *      through QF / SF / TP / Final. Each round resolves only when the
 *      upstream round has a declared winner.
 *
 * Missing inputs propagate as `null` cleanly: a fixture without two
 * resolved teams cannot have a predicted winner, and downstream fixtures
 * remain null until the chain fills in. This lets the UI render a partial
 * bracket and prompt the user to fill in gaps.
 */
export function buildBracket(input: BracketEngineInput): BracketPreviewDto {
  const { groupMatches, fifaRanks, knockoutScores } = input;
  const scores = knockoutScores ?? {};

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

  const thirdSlots = R32_FIXTURES.flatMap((f) => {
    const slots: Array<{ id: string; allowedGroups: GroupLetter[] }> = [];
    if (f.topSlot.kind === 'BEST_THIRD_FROM') {
      slots.push({ id: `${f.id}:top`, allowedGroups: f.topSlot.allowedGroups });
    }
    if (f.bottomSlot.kind === 'BEST_THIRD_FROM') {
      slots.push({ id: `${f.id}:bottom`, allowedGroups: f.bottomSlot.allowedGroups });
    }
    return slots;
  });
  const thirdBySlotId =
    bestThirds.length >= thirdSlots.length
      ? assignThirdsToSlots(thirdSlots, bestThirds)
      : new Map<string, string>();

  const resolved = new Map<string, ResolvedFixture>();
  for (const template of ALL_FIXTURES) {
    const topTeamCode = resolveSlot(
      template.topSlot,
      standingsByGroup,
      thirdBySlotId,
      resolved,
      `${template.id}:top`,
    );
    const bottomTeamCode = resolveSlot(
      template.bottomSlot,
      standingsByGroup,
      thirdBySlotId,
      resolved,
      `${template.id}:bottom`,
    );
    const { winner, loser } = deriveWinnerFromScore(
      topTeamCode,
      bottomTeamCode,
      scores[template.id],
    );
    resolved.set(template.id, {
      template,
      topTeamCode,
      bottomTeamCode,
      predictedWinnerCode: winner,
      predictedLoserCode: loser,
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
