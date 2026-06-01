import { scoreKnockoutGuess, type KnockoutScoreResult } from './knockout-score-engine';

/** Resultado oficial de um confronto do mata-mata (top = mandante). */
export interface OfficialKnockoutResult {
  fixtureId: string;
  topTeamCode: string;
  bottomTeamCode: string;
  topGoals: number;
  bottomGoals: number;
}

/**
 * Palpite de mata-mata de um jogador para UM confronto: os times que ELE
 * previu para aquele slot do bracket + o placar que ele cravou. Os times
 * vêm do bracket previsto do jogador (`BracketPrediction.payload.bracket`),
 * e o placar de `payload.knockoutScores[fixtureId]`.
 */
export interface PlayerKnockoutGuess {
  topTeamCode: string | null;
  bottomTeamCode: string | null;
  topGoals: number;
  bottomGoals: number;
}

export interface PlayerKnockoutScore {
  fixtureId: string;
  teamPoints: number;
  scorePoints: number;
  points: number;
}

/**
 * Pontua o palpite de um jogador para um confronto oficial do mata-mata,
 * reusando o engine puro {@link scoreKnockoutGuess}: +15 por time certo no
 * slot certo, +placar (cascata de grupos) quando ambos os times batem.
 * Determinístico, sem efeitos colaterais.
 */
export function scorePlayerKnockoutFixture(
  official: OfficialKnockoutResult,
  guess: PlayerKnockoutGuess | undefined,
): PlayerKnockoutScore {
  if (!guess) {
    return { fixtureId: official.fixtureId, teamPoints: 0, scorePoints: 0, points: 0 };
  }
  const r: KnockoutScoreResult = scoreKnockoutGuess(
    {
      topTeamCode: guess.topTeamCode,
      bottomTeamCode: guess.bottomTeamCode,
      topGoals: guess.topGoals,
      bottomGoals: guess.bottomGoals,
    },
    {
      topTeamCode: official.topTeamCode,
      bottomTeamCode: official.bottomTeamCode,
      topGoals: official.topGoals,
      bottomGoals: official.bottomGoals,
    },
  );
  return {
    fixtureId: official.fixtureId,
    teamPoints: r.teamPoints,
    scorePoints: r.scorePoints,
    points: r.totalPoints,
  };
}

/**
 * Deriva quem avançou de um resultado oficial. Quando o placar não é empate,
 * vence quem fez mais gols; em empate (decisão por pênaltis), usa o
 * `advancesTeamCode` informado pelo admin.
 */
export function deriveAdvancer(
  topTeamCode: string,
  bottomTeamCode: string,
  topGoals: number,
  bottomGoals: number,
  advancesTeamCode: string | null,
): string | null {
  if (topGoals > bottomGoals) return topTeamCode;
  if (bottomGoals > topGoals) return bottomTeamCode;
  if (advancesTeamCode === topTeamCode || advancesTeamCode === bottomTeamCode) {
    return advancesTeamCode;
  }
  return null;
}
