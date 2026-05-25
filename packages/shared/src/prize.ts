export type PrizeCategory =
  | '1st'
  | '2nd'
  | '3rd'
  | '4th'
  | '5th'
  | 'exact_score_king'
  | 'admin';

export const PRIZE_DISTRIBUTION: Record<PrizeCategory, number> = {
  '1st': 0.45,
  '2nd': 0.2,
  '3rd': 0.12,
  '4th': 0.08,
  '5th': 0.05,
  exact_score_king: 0.05,
  admin: 0.05,
};

export interface PrizeBreakdownDto {
  category: PrizeCategory;
  percentage: number;
  valueCents: number;
  currentLeader?: {
    userId: string;
    name: string;
    points?: number;
    exactScores?: number;
  };
}

export interface PrizesViewDto {
  totalSubscribers: number;
  poolTotalCents: number;
  currency: 'BRL';
  computedAt: string;
  prizes: PrizeBreakdownDto[];
}
