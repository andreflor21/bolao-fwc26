import type { GroupLetter } from '@bolao/shared';
import type { FifaRanks, GroupMatchResult, GroupStanding } from './types';

interface Aggregates {
  played: number;
  won: number;
  drawn: number;
  lost: number;
  goalsFor: number;
  goalsAgainst: number;
}

function emptyAggregates(): Aggregates {
  return { played: 0, won: 0, drawn: 0, lost: 0, goalsFor: 0, goalsAgainst: 0 };
}

function applyMatch(agg: Aggregates, teamCode: string, match: GroupMatchResult): void {
  const isHome = match.homeTeamCode === teamCode;
  const isAway = match.awayTeamCode === teamCode;
  if (!isHome && !isAway) return;

  const own = isHome ? match.homeGoals : match.awayGoals;
  const opp = isHome ? match.awayGoals : match.homeGoals;

  agg.played += 1;
  agg.goalsFor += own;
  agg.goalsAgainst += opp;
  if (own > opp) agg.won += 1;
  else if (own < opp) agg.lost += 1;
  else agg.drawn += 1;
}

function aggregatesFor(teamCode: string, matches: GroupMatchResult[]): Aggregates {
  const agg = emptyAggregates();
  for (const m of matches) applyMatch(agg, teamCode, m);
  return agg;
}

function pointsOf(a: Aggregates): number {
  return a.won * 3 + a.drawn;
}

/** pts → gd → gf within the provided match subset. */
function compareByAggregate(
  a: string,
  b: string,
  matches: GroupMatchResult[],
): number {
  const aggA = aggregatesFor(a, matches);
  const aggB = aggregatesFor(b, matches);
  const ptsDiff = pointsOf(aggB) - pointsOf(aggA);
  if (ptsDiff !== 0) return ptsDiff;
  const gdDiff = (aggB.goalsFor - aggB.goalsAgainst) - (aggA.goalsFor - aggA.goalsAgainst);
  if (gdDiff !== 0) return gdDiff;
  return aggB.goalsFor - aggA.goalsFor;
}

/** Overall GD then GF (no pts — entering this stage assumes overall pts are equal). */
function compareOverallGdGf(
  a: string,
  b: string,
  allMatches: GroupMatchResult[],
): number {
  const aggA = aggregatesFor(a, allMatches);
  const aggB = aggregatesFor(b, allMatches);
  const gdDiff = (aggB.goalsFor - aggB.goalsAgainst) - (aggA.goalsFor - aggA.goalsAgainst);
  if (gdDiff !== 0) return gdDiff;
  return aggB.goalsFor - aggA.goalsFor;
}

function filterH2H(matches: GroupMatchResult[], teams: string[]): GroupMatchResult[] {
  const set = new Set(teams);
  return matches.filter((m) => set.has(m.homeTeamCode) && set.has(m.awayTeamCode));
}

function partitionByEqual<T>(items: T[], equal: (a: T, b: T) => boolean): T[][] {
  if (items.length === 0) return [];
  const out: T[][] = [];
  let cur: T[] = [items[0]!];
  for (let i = 1; i < items.length; i++) {
    if (equal(cur[cur.length - 1]!, items[i]!)) cur.push(items[i]!);
    else {
      out.push(cur);
      cur = [items[i]!];
    }
  }
  out.push(cur);
  return out;
}

function sortByFifaRank(teams: string[], fifaRanks: FifaRanks): string[] {
  return [...teams].sort((a, b) => (fifaRanks[a] ?? 9999) - (fifaRanks[b] ?? 9999));
}

/**
 * Applies the user-supplied manual order to a still-tied subset. Returns
 * the reordered list only when every team in the subset is present in
 * `manualOrder`; otherwise returns null so the caller falls back to FIFA.
 */
function applyManualOrder(subset: string[], manualOrder: string[] | undefined): string[] | null {
  if (!manualOrder || manualOrder.length === 0) return null;
  const indexed = subset.map((t) => ({ t, idx: manualOrder.indexOf(t) }));
  if (indexed.some((x) => x.idx < 0)) return null;
  indexed.sort((a, b) => a.idx - b.idx);
  return indexed.map((x) => x.t);
}

/**
 * Splits the still-tied subset using overall GD → overall GF. Any sub-tranche
 * that remains tied after that is decided by manual order (when the user
 * provided it covering the subset) or FIFA rank as the deterministic fallback.
 * Every sub-tranche that needs manual/FIFA is recorded in `unresolved`.
 */
function applyOverallThenManual(
  subset: string[],
  allMatches: GroupMatchResult[],
  manualOrder: string[] | undefined,
  fifaRanks: FifaRanks,
  unresolved: string[][],
): string[] {
  const sorted = [...subset].sort((a, b) => compareOverallGdGf(a, b, allMatches));
  const tranches = partitionByEqual(
    sorted,
    (a, b) => compareOverallGdGf(a, b, allMatches) === 0,
  );
  const out: string[] = [];
  for (const tr of tranches) {
    if (tr.length === 1) {
      out.push(tr[0]!);
      continue;
    }
    unresolved.push([...tr]);
    const manual = applyManualOrder(tr, manualOrder);
    if (manual) {
      out.push(...manual);
    } else {
      out.push(...sortByFifaRank(tr, fifaRanks));
    }
  }
  return out;
}

/**
 * Breaks ties within a subset of teams that share the same overall points,
 * following the FIFA-style head-to-head-first cascade:
 *
 *   1. H2H points (restricted to matches among the tied subset)
 *   2. H2H goal difference
 *   3. H2H goals for
 *   4. Overall goal difference (across all group matches)
 *   5. Overall goals for
 *   6. Manual user-supplied order (covering the still-tied subset)
 *   7. FIFA rank (deterministic last-resort fallback)
 *
 * When step 1-3 shrink the tied set but a sub-tranche remains tied at the
 * same H2H cascade, the sub-tranche is recursed with H2H recomputed on the
 * smaller subset (since dropping teams changes which matches count as H2H).
 */
function breakTies(
  tied: string[],
  allMatches: GroupMatchResult[],
  manualOrder: string[] | undefined,
  fifaRanks: FifaRanks,
  unresolved: string[][],
): string[] {
  if (tied.length <= 1) return tied;

  // Cascade through H2H pts/gd/gf restricted to the current tied subset.
  const h2hMatches = filterH2H(allMatches, tied);
  const sorted = [...tied].sort((a, b) => compareByAggregate(a, b, h2hMatches));
  const h2hTranches = partitionByEqual(
    sorted,
    (a, b) => compareByAggregate(a, b, h2hMatches) === 0,
  );

  const out: string[] = [];
  for (const tr of h2hTranches) {
    if (tr.length === 1) {
      out.push(tr[0]!);
      continue;
    }
    if (tr.length < tied.length) {
      // H2H reduced the subset — recurse so H2H recomputes on the smaller set.
      out.push(...breakTies(tr, allMatches, manualOrder, fifaRanks, unresolved));
    } else {
      // H2H couldn't differentiate the whole set — move to overall stats.
      out.push(...applyOverallThenManual(tr, allMatches, manualOrder, fifaRanks, unresolved));
    }
  }
  return out;
}

export interface ComputeStandingsResult {
  standings: GroupStanding[];
  /**
   * Subsets of 2+ teams that remained tied even after all automatic criteria
   * (steps 1-5 of the cascade) were exhausted. These were decided by the
   * provided manual order, or by FIFA rank as the deterministic fallback when
   * no manual order covered the subset. The UI uses this to surface a
   * "resolver empate" widget so the player can pick the order explicitly.
   */
  unresolvedTies: string[][];
}

/**
 * Computes the standings of a single group, ordered from 1st to 4th place.
 *
 * Outer sort uses overall points only (the canonical FIFA group cascade
 * groups teams by points first, then resolves ties with the H2H sub-loop).
 * Within each tied-on-points tranche, see {@link breakTies} for the cascade.
 *
 * `manualTiebreakOrder` is an optional list of team codes for this group
 * that the player has supplied (e.g. via the "resolver empate" UI). When
 * present and covering a still-tied subset, it overrides the FIFA-rank
 * fallback; FIFA rank is used otherwise.
 */
export function computeStandings(
  groupLetter: GroupLetter,
  groupMatches: GroupMatchResult[],
  fifaRanks: FifaRanks,
  manualTiebreakOrder?: string[],
): ComputeStandingsResult {
  const teamSet = new Set<string>();
  for (const m of groupMatches) {
    teamSet.add(m.homeTeamCode);
    teamSet.add(m.awayTeamCode);
  }
  const teams = [...teamSet];

  // Outer sort: overall points only. Ties on points trigger the H2H cascade.
  const byPoints = [...teams].sort(
    (a, b) =>
      pointsOf(aggregatesFor(b, groupMatches)) - pointsOf(aggregatesFor(a, groupMatches)),
  );

  const unresolved: string[][] = [];
  const ordered: string[] = [];
  const pointsTranches = partitionByEqual(
    byPoints,
    (a, b) =>
      pointsOf(aggregatesFor(a, groupMatches)) === pointsOf(aggregatesFor(b, groupMatches)),
  );
  for (const tranche of pointsTranches) {
    if (tranche.length === 1) ordered.push(tranche[0]!);
    else ordered.push(...breakTies(tranche, groupMatches, manualTiebreakOrder, fifaRanks, unresolved));
  }

  const standings: GroupStanding[] = ordered.map((teamCode, idx) => {
    const agg = aggregatesFor(teamCode, groupMatches);
    return {
      teamCode,
      groupLetter,
      position: (idx + 1) as 1 | 2 | 3 | 4,
      played: agg.played,
      won: agg.won,
      drawn: agg.drawn,
      lost: agg.lost,
      goalsFor: agg.goalsFor,
      goalsAgainst: agg.goalsAgainst,
      goalDifference: agg.goalsFor - agg.goalsAgainst,
      points: pointsOf(agg),
      fifaRank: fifaRanks[teamCode] ?? 9999,
    };
  });

  return { standings, unresolvedTies: unresolved };
}
