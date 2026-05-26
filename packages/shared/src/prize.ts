export type PrizeCategory =
  | 'first'
  | 'second'
  | 'third'
  | 'fourth'
  | 'fifth'
  | 'exact_score_king'
  | 'admin';

export const PRIZE_CATEGORIES: PrizeCategory[] = [
  'first',
  'second',
  'third',
  'fourth',
  'fifth',
  'exact_score_king',
  'admin',
];

export const PRIZE_DISTRIBUTION: Record<PrizeCategory, number> = {
  first: 0.45,
  second: 0.2,
  third: 0.12,
  fourth: 0.08,
  fifth: 0.05,
  exact_score_king: 0.05,
  admin: 0.05,
};

export const PRIZE_LABELS: Record<PrizeCategory, string> = {
  first: '1º lugar',
  second: '2º lugar',
  third: '3º lugar',
  fourth: '4º lugar',
  fifth: '5º lugar',
  exact_score_king: 'Rei dos Placares',
  admin: 'Organização',
};

export interface PrizeLeader {
  userId: string;
  name: string;
  /** Points for positional prizes, exact-score count for the Rei dos Placares. */
  metric: number;
}

export interface PrizeBreakdownDto {
  category: PrizeCategory;
  label: string;
  percentage: number;
  valueCents: number;
  /** Current candidate(s). Multiple entries when there's a tie at this slot. */
  currentLeaders: PrizeLeader[];
}

export interface PrizesViewDto {
  totalSubscribers: number;
  poolTotalCents: number;
  currency: 'BRL';
  computedAt: string;
  prizes: PrizeBreakdownDto[];
}

export interface FinalPrizePayoutDto {
  userId: string | null;
  category: PrizeCategory;
  /** Share of the category prize received by this user (cents). */
  amountCents: number;
  /** Original distribution percentage (not adjusted for ties). */
  percentage: number;
}
