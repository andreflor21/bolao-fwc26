import type {
  BracketFixtureDto,
  BracketPreviewDto,
  GroupLetter,
  KnockoutScoreEntryDto,
  UnresolvedTieDto,
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
import {
  ANNEX_C_THIRD_PLACE,
  ANNEX_C_FIXTURE_BY_WINNER,
} from './annex-c-third-place';
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
  /**
   * Per-group manual tie-break order supplied by the player. Used as a
   * fallback when the automatic FIFA-style cascade (H2H pts/gd/gf + overall
   * gd/gf) leaves two or more teams in a group still tied. See
   * {@link computeStandings} for the exact precedence.
   */
  manualTiebreakOrder?: Partial<Record<GroupLetter, string[]>>;
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
 * Bipartite matching of thirds to slots respecting per-slot allowed-groups,
 * returning the FIRST valid assignment found via backtracking. The
 * allowed-groups constraints alone DO NOT determine a unique matching (in all
 * 495 FIFA combinations there is more than one valid matching), so this is
 * order-dependent and NOT regulation-correct on its own. Kept only as a
 * defensive fallback for the (impossible-by-design) case where the qualifying
 * set of thirds is not one of the 495 Annex C combinations.
 *
 * Returns slotId → teamCode, or an empty map if no valid matching exists.
 */
function assignThirdsByMatching(
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
  }
  return result;
}

/**
 * Assigns each of the 8 advancing thirds to exactly one BEST_THIRD_FROM R32
 * slot following the OFFICIAL FIFA 2026 Annex C allocation table.
 *
 * The set of 8 qualifying thirds (their group letters, sorted) is the key into
 * {@link ANNEX_C_THIRD_PLACE}; that table fixes, for each group-winner fixture,
 * exactly which third group it faces. This is the regulation-correct rule — the
 * per-slot `allowedGroups` only bound the candidates and leave the matching
 * ambiguous, so they must NOT be used to pick the pairing.
 *
 * Slot ids are `${fixtureId}:top|:bottom`; only the fixture id is used to find
 * the winner group (all 8 best-third slots are the bottom of a winner fixture).
 *
 * Returns a map slotId → teamCode. Falls back to {@link assignThirdsByMatching}
 * only if the qualifying set is not a known Annex C combination (defensive;
 * impossible under valid group standings), and to a constraint-free assignment
 * if even that fails.
 */
export function assignThirdsToSlots(
  slots: Array<{ id: string; allowedGroups: GroupLetter[] }>,
  thirds: ThirdPlaceSlot[],
): Map<string, string> {
  const result = new Map<string, string>();
  if (thirds.length < slots.length) return result;

  // Annex C is defined for exactly the 8 qualifying thirds.
  if (thirds.length === 8) {
    const comboKey = thirds
      .map((t) => t.groupLetter)
      .sort()
      .join('');
    const allocation = ANNEX_C_THIRD_PLACE[comboKey];
    if (allocation) {
      const teamByGroup = new Map<GroupLetter, string>();
      for (const third of thirds) teamByGroup.set(third.groupLetter, third.teamCode);

      // winner group -> fixture id; invert to resolve each slot's fixture.
      const winnerByFixture = new Map<string, GroupLetter>();
      for (const [winner, fixtureId] of Object.entries(ANNEX_C_FIXTURE_BY_WINNER)) {
        winnerByFixture.set(fixtureId, winner as GroupLetter);
      }

      let complete = true;
      for (const slot of slots) {
        const fixtureId = slot.id.split(':')[0]!;
        const winnerGroup = winnerByFixture.get(fixtureId);
        const thirdGroup = winnerGroup ? allocation[winnerGroup] : undefined;
        const teamCode = thirdGroup ? teamByGroup.get(thirdGroup) : undefined;
        if (!teamCode) {
          complete = false;
          break;
        }
        result.set(slot.id, teamCode);
      }
      if (complete) return result;
      result.clear();
    }
  }

  // Defensive fallback: the qualifying set is not a known Annex C combination.
  const matched = assignThirdsByMatching(slots, thirds);
  if (matched.size === slots.length) return matched;

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
  const { groupMatches, fifaRanks, knockoutScores, manualTiebreakOrder } = input;
  const scores = knockoutScores ?? {};
  const manual = manualTiebreakOrder ?? {};

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
  const unresolvedTies: UnresolvedTieDto[] = [];
  for (const letter of GROUP_LETTERS) {
    const matches = matchesByGroup.get(letter) ?? [];
    if (matches.length === 0) continue;
    const result = computeStandings(letter, matches, fifaRanks, manual[letter]);
    standingsByGroup.set(letter, result.standings);
    groupsForDto[letter] = result.standings;
    for (const subset of result.unresolvedTies) {
      const positions = result.standings
        .filter((s) => subset.includes(s.teamCode))
        .map((s) => s.position);
      unresolvedTies.push({
        groupLetter: letter,
        teamCodes: subset,
        positions,
      });
    }
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
    unresolvedTies,
  };
}
