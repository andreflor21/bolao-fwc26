import {
  PRIZE_DISTRIBUTION,
  PRIZE_LABELS,
  type FinalPrizePayoutDto,
  type PrizeBreakdownDto,
  type PrizeCategory,
  type PrizeLeader,
  type PrizesViewDto,
} from '@bolao/shared';

export interface RankedUser {
  userId: string;
  name: string;
  points: number;
}

export interface ExactScoreUser {
  userId: string;
  name: string;
  exactScores: number;
}

const POSITIONAL_CATEGORIES: PrizeCategory[] = ['first', 'second', 'third', 'fourth', 'fifth'];

/**
 * Computes the live prize breakdown — base values per category, current
 * leaders (with ties resolved by listing every tied user). Residual cents
 * from per-category truncation are added to the `admin` slot to preserve
 * total pool conservation: ∑ categories = pool exactly.
 */
export function computeBreakdown(
  totalSubscribers: number,
  amountCentsPerSubscription: number,
  ranking: RankedUser[],
  exactScores: ExactScoreUser[],
  distribution: Record<PrizeCategory, number> = PRIZE_DISTRIBUTION,
): PrizesViewDto {
  const pool = totalSubscribers * amountCentsPerSubscription;
  const base: Record<PrizeCategory, number> = {
    first: Math.floor(pool * (distribution.first ?? 0)),
    second: Math.floor(pool * (distribution.second ?? 0)),
    third: Math.floor(pool * (distribution.third ?? 0)),
    fourth: Math.floor(pool * (distribution.fourth ?? 0)),
    fifth: Math.floor(pool * (distribution.fifth ?? 0)),
    exact_score_king: Math.floor(pool * (distribution.exact_score_king ?? 0)),
    admin: Math.floor(pool * (distribution.admin ?? 0)),
  };
  const summed = Object.values(base).reduce((a, b) => a + b, 0);
  base.admin += pool - summed; // residual cents → admin

  const leadersByCategory = positionalLeaders(ranking);
  const exactLeaders = topByExactScore(exactScores);

  const prizes: PrizeBreakdownDto[] = [];
  for (const cat of POSITIONAL_CATEGORIES) {
    prizes.push({
      category: cat,
      label: PRIZE_LABELS[cat],
      percentage: distribution[cat] ?? 0,
      valueCents: base[cat],
      currentLeaders: leadersByCategory[cat] ?? [],
    });
  }
  prizes.push({
    category: 'exact_score_king',
    label: PRIZE_LABELS.exact_score_king,
    percentage: distribution.exact_score_king ?? 0,
    valueCents: base.exact_score_king,
    currentLeaders: exactLeaders,
  });
  prizes.push({
    category: 'admin',
    label: PRIZE_LABELS.admin,
    percentage: distribution.admin ?? 0,
    valueCents: base.admin,
    currentLeaders: [],
  });

  return {
    totalSubscribers,
    poolTotalCents: pool,
    currency: 'BRL',
    computedAt: new Date().toISOString(),
    prizes,
  };
}

/**
 * Computes the final payout list from the closing ranking. Ties at a
 * positional slot split that slot's prize equally; the subsequent positions
 * are skipped (3 tied at 1st ⇒ no 2nd, no 3rd; the next prize awarded is
 * 4th, going to the actual 4th-ranked user).
 *
 * Exact-score king is split equally among everyone tied at the top counter.
 * Admin prize is left with `userId: null` so the operator team can claim or
 * reassign it manually.
 */
export function finalize(
  totalSubscribers: number,
  amountCentsPerSubscription: number,
  finalRanking: RankedUser[],
  exactScores: ExactScoreUser[],
  distribution: Record<PrizeCategory, number> = PRIZE_DISTRIBUTION,
): FinalPrizePayoutDto[] {
  const breakdown = computeBreakdown(
    totalSubscribers,
    amountCentsPerSubscription,
    finalRanking,
    exactScores,
    distribution,
  );
  const valueByCat = new Map<PrizeCategory, number>();
  for (const p of breakdown.prizes) valueByCat.set(p.category, p.valueCents);

  const payouts: FinalPrizePayoutDto[] = [];
  let nextPosition = 1;
  let cursorIdx = 0;

  while (cursorIdx < finalRanking.length && nextPosition <= 5) {
    const head = finalRanking[cursorIdx]!;
    const tieGroup = [head];
    let j = cursorIdx + 1;
    while (j < finalRanking.length && finalRanking[j]!.points === head.points) {
      tieGroup.push(finalRanking[j]!);
      j += 1;
    }

    const category = POSITIONAL_CATEGORIES[nextPosition - 1];
    if (!category) break;
    const total = valueByCat.get(category) ?? 0;
    const share = splitEqually(total, tieGroup.length);

    for (let i = 0; i < tieGroup.length; i++) {
      payouts.push({
        userId: tieGroup[i]!.userId,
        category,
        amountCents: share[i]!,
        percentage: distribution[category] ?? 0,
      });
    }

    nextPosition += tieGroup.length;
    cursorIdx = j;
  }

  // Exact-score king — split equally among all tied at the top counter.
  const topExact = exactScores
    .slice()
    .sort((a, b) => b.exactScores - a.exactScores)
    .filter((e) => e.exactScores > 0);
  if (topExact.length > 0) {
    const topCount = topExact[0]!.exactScores;
    const tied = topExact.filter((e) => e.exactScores === topCount);
    const total = valueByCat.get('exact_score_king') ?? 0;
    const share = splitEqually(total, tied.length);
    for (let i = 0; i < tied.length; i++) {
      payouts.push({
        userId: tied[i]!.userId,
        category: 'exact_score_king',
        amountCents: share[i]!,
        percentage: distribution.exact_score_king ?? 0,
      });
    }
  }

  // Admin prize — recorded with null userId (claimed off-app).
  payouts.push({
    userId: null,
    category: 'admin',
    amountCents: valueByCat.get('admin') ?? 0,
    percentage: distribution.admin ?? 0,
  });

  return payouts;
}

function positionalLeaders(ranking: RankedUser[]): Record<PrizeCategory, PrizeLeader[]> {
  const out: Record<PrizeCategory, PrizeLeader[]> = {
    first: [],
    second: [],
    third: [],
    fourth: [],
    fifth: [],
    exact_score_king: [],
    admin: [],
  };
  let cursor = 0;
  let nextPos = 1;
  while (cursor < ranking.length && nextPos <= 5) {
    const head = ranking[cursor]!;
    const group = [head];
    let j = cursor + 1;
    while (j < ranking.length && ranking[j]!.points === head.points) {
      group.push(ranking[j]!);
      j += 1;
    }
    const category = POSITIONAL_CATEGORIES[nextPos - 1];
    if (category) {
      out[category] = group.map((u) => ({
        userId: u.userId,
        name: u.name,
        metric: u.points,
      }));
    }
    nextPos += group.length;
    cursor = j;
  }
  return out;
}

function topByExactScore(users: ExactScoreUser[]): PrizeLeader[] {
  const sorted = users
    .filter((u) => u.exactScores > 0)
    .sort((a, b) => b.exactScores - a.exactScores);
  if (sorted.length === 0) return [];
  const top = sorted[0]!.exactScores;
  return sorted
    .filter((u) => u.exactScores === top)
    .map((u) => ({ userId: u.userId, name: u.name, metric: u.exactScores }));
}

/**
 * Splits `total` cents across `n` recipients. Each gets floor(total/n);
 * the residual cents (0 to n-1) are spread one-by-one to the first
 * recipients so the sum exactly equals `total`.
 */
function splitEqually(total: number, n: number): number[] {
  if (n <= 0) return [];
  const base = Math.floor(total / n);
  const residual = total - base * n;
  return Array.from({ length: n }, (_, i) => base + (i < residual ? 1 : 0));
}
