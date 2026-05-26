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

/**
 * Compares two teams using cascade pts → gd → gf, restricted to the
 * provided match subset.
 */
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

/**
 * Sorts a group of tied teams using the head-to-head sub-loop, then FIFA rank
 * as the final auxiliary tie-break (lower rank = better team).
 *
 * If the entire tied set is the whole group (size 4), head-to-head against
 * each other equals all matches, so it cannot break the tie — we fall back
 * straight to FIFA rank.
 */
function breakTies(
  tied: string[],
  allMatches: GroupMatchResult[],
  fifaRanks: FifaRanks,
): string[] {
  if (tied.length <= 1) return tied;

  if (tied.length < 4) {
    const h2hMatches = allMatches.filter(
      (m) => tied.includes(m.homeTeamCode) && tied.includes(m.awayTeamCode),
    );
    const reordered = [...tied].sort((a, b) => compareByAggregate(a, b, h2hMatches));

    // Recurse into still-tied sub-groups (compared on h2h subset).
    const out: string[] = [];
    let i = 0;
    while (i < reordered.length) {
      const head = reordered[i]!;
      const tail = [head];
      let j = i + 1;
      while (
        j < reordered.length &&
        compareByAggregate(head, reordered[j]!, h2hMatches) === 0
      ) {
        tail.push(reordered[j]!);
        j += 1;
      }
      if (tail.length === 1) {
        out.push(head);
      } else {
        // Final fallback for still-tied subset: FIFA rank.
        out.push(...sortByFifaRank(tail, fifaRanks));
      }
      i = j;
    }
    return out;
  }

  // All 4 tied → FIFA rank decides.
  return sortByFifaRank(tied, fifaRanks);
}

function sortByFifaRank(teams: string[], fifaRanks: FifaRanks): string[] {
  return [...teams].sort((a, b) => (fifaRanks[a] ?? 9999) - (fifaRanks[b] ?? 9999));
}

/**
 * Computes the standings of a single group, ordered from 1st to 4th place,
 * applying the FIFA 2026 tie-break cascade:
 *
 *   1. Points
 *   2. Goal difference
 *   3. Goals scored
 *   4. Head-to-head (sub-loop with the same cascade among tied teams)
 *   5. FIFA rank (lower is better) as deterministic auxiliary tie-break
 *      (fair play is not simulable from the data we hold).
 */
export function computeStandings(
  groupLetter: GroupLetter,
  groupMatches: GroupMatchResult[],
  fifaRanks: FifaRanks,
): GroupStanding[] {
  const teamSet = new Set<string>();
  for (const m of groupMatches) {
    teamSet.add(m.homeTeamCode);
    teamSet.add(m.awayTeamCode);
  }
  const teams = [...teamSet];

  // Initial cascade: pts → gd → gf using all group matches.
  const initial = [...teams].sort((a, b) => compareByAggregate(a, b, groupMatches));

  // Break ties within identical (pts, gd, gf) tranches.
  const ordered: string[] = [];
  let i = 0;
  while (i < initial.length) {
    const head = initial[i]!;
    const tied = [head];
    let j = i + 1;
    while (
      j < initial.length &&
      compareByAggregate(head, initial[j]!, groupMatches) === 0
    ) {
      tied.push(initial[j]!);
      j += 1;
    }
    ordered.push(...breakTies(tied, groupMatches, fifaRanks));
    i = j;
  }

  return ordered.map((teamCode, idx) => {
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
}
