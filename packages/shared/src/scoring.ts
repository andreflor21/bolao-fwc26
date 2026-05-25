export const SCORE_RULES = {
  EXACT_SCORE: 10,
  WINNER_AND_ONE_GOAL: 8,
  WINNER_ONLY: 6,
  DRAW_RESULT_WRONG_SCORE: 4,
  ONE_GOAL_ONLY: 2,
  MISS: 0,
} as const;

export type ScoreRule = keyof typeof SCORE_RULES;
