export interface RankingRowDto {
  position: number;
  userId: string;
  name: string;
  points: number;
  exactScores: number;
  /** True for the authenticated user's own row (UI highlight). */
  isOwn: boolean;
}

export interface RankingDto {
  rows: RankingRowDto[];
  /** 1-indexed; null when the user has no recorded score yet. */
  ownPosition: number | null;
  /** Total ranked users. */
  total: number;
  /** Name of the pool (e.g. "Geral" or the side-pool name). */
  poolName: string;
}
