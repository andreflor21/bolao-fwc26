export const SCORE_RULES = {
  EXACT_SCORE: 10,
  WINNER_AND_ONE_GOAL: 8,
  WINNER_ONLY: 6,
  DRAW_RESULT_WRONG_SCORE: 4,
  ONE_GOAL_ONLY: 2,
  MISS: 0,
} as const;

export type ScoreRule = keyof typeof SCORE_RULES;

/** Rótulos curtos em pt-BR para exibir a regra que pontuou um palpite. */
export const SCORE_RULE_LABELS: Record<ScoreRule, string> = {
  EXACT_SCORE: 'Placar exato',
  WINNER_AND_ONE_GOAL: 'Vencedor + 1 placar',
  WINNER_ONLY: 'Vencedor certo',
  DRAW_RESULT_WRONG_SCORE: 'Empate certo',
  ONE_GOAL_ONLY: 'Acertou 1 placar',
  MISS: 'Sem acerto',
};
