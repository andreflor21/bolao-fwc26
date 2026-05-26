import { scoreGuess } from './score-engine';
import type { ScoreRule } from '@bolao/shared';

export interface KnockoutGuess {
  /** Team the player predicted for the top slot (or null when no prediction). */
  topTeamCode: string | null;
  /** Team the player predicted for the bottom slot. */
  bottomTeamCode: string | null;
  /** Player's predicted goal count for the top team. */
  topGoals: number;
  /** Player's predicted goal count for the bottom team. */
  bottomGoals: number;
}

export interface KnockoutOfficial {
  topTeamCode: string;
  bottomTeamCode: string;
  topGoals: number;
  bottomGoals: number;
}

export interface KnockoutScoreResult {
  teamPoints: number;
  scorePoints: number;
  totalPoints: number;
  breakdown: {
    topTeamHit: boolean;
    bottomTeamHit: boolean;
    bothTeamsHit: boolean;
    scoreRule: ScoreRule | null;
  };
}

export const KO_POINTS_PER_TEAM = 15;

/**
 * Scores a single knockout-stage guess against the official result.
 *
 *   +15 pts per correct team in the correct slot (max 30 for both teams).
 *   +placar (10/8/6/4/2/0 cascade from the group-stage ScoreEngine) when
 *    AND ONLY when both teams are correct.
 *
 * Maximum possible per knockout match: 15 + 15 + 10 = 40 pts.
 *
 * Pure and deterministic — no DB, no side effects.
 */
export function scoreKnockoutGuess(
  guess: KnockoutGuess,
  official: KnockoutOfficial,
): KnockoutScoreResult {
  const topTeamHit =
    guess.topTeamCode !== null && guess.topTeamCode === official.topTeamCode;
  const bottomTeamHit =
    guess.bottomTeamCode !== null && guess.bottomTeamCode === official.bottomTeamCode;
  const bothTeamsHit = topTeamHit && bottomTeamHit;

  const teamPoints =
    (topTeamHit ? KO_POINTS_PER_TEAM : 0) + (bottomTeamHit ? KO_POINTS_PER_TEAM : 0);

  let scorePoints = 0;
  let scoreRule: ScoreRule | null = null;
  if (bothTeamsHit) {
    const r = scoreGuess(
      { homeGoals: guess.topGoals, awayGoals: guess.bottomGoals },
      { homeGoals: official.topGoals, awayGoals: official.bottomGoals },
    );
    scorePoints = r.points;
    scoreRule = r.ruleApplied;
  }

  return {
    teamPoints,
    scorePoints,
    totalPoints: teamPoints + scorePoints,
    breakdown: { topTeamHit, bottomTeamHit, bothTeamsHit, scoreRule },
  };
}
