export const SCORE_RULES = {
  EXACT_SCORE: 10,
  WINNER_AND_ONE_GOAL: 8,
  WINNER_ONLY: 6,
  DRAW_RESULT_WRONG_SCORE: 4,
  ONE_GOAL_ONLY: 2,
  MISS: 0,
} as const;

export type ScoreRule = keyof typeof SCORE_RULES;

/**
 * Rótulos curtos em pt-BR para o badge da fase de grupos:
 * Placar | Vencedor + Gol | Vencedor | Empate (+ Gol / Errou pros casos restantes).
 */
export const SCORE_RULE_LABELS: Record<ScoreRule, string> = {
  EXACT_SCORE: 'Placar',
  WINNER_AND_ONE_GOAL: 'Vencedor + Gol',
  WINNER_ONLY: 'Vencedor',
  DRAW_RESULT_WRONG_SCORE: 'Empate',
  ONE_GOAL_ONLY: 'Gol',
  MISS: 'Errou',
};

/**
 * Rótulo do badge do mata-mata, derivado do breakdown de pontos:
 *   Times + Placar | Vencedor + Gol | Vencedor | Empate ou Time.
 *
 * `teamPoints`: 0 (nenhum time), 15 (um time), 30 (os dois times no slot certo).
 * `scorePoints`: cascata 10/8/6/4/2/0 (só conta quando os dois times batem).
 */
export function knockoutRuleLabel(teamPoints: number, scorePoints: number): string {
  // Acertou os dois times no slot certo → detalha pelo placar.
  if (teamPoints >= 30) {
    if (scorePoints >= 10) return 'Times + Placar';
    if (scorePoints >= 8) return 'Vencedor + Gol';
    if (scorePoints >= 6) return 'Vencedor';
    if (scorePoints >= 2) return 'Empate ou Gol';
    return 'Só os times';
  }
  // Acertou só um time (ou quem avançou) → crédito parcial.
  if (teamPoints > 0) return 'Empate ou Time';
  return 'Errou';
}
