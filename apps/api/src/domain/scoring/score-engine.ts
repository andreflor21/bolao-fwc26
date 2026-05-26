import { SCORE_RULES, type ScoreRule } from '@bolao/shared';

export interface GuessInput {
  homeGoals: number;
  awayGoals: number;
}

export interface OfficialResult {
  homeGoals: number;
  awayGoals: number;
}

export interface ScoreResult {
  points: number;
  ruleApplied: ScoreRule;
}

function winnerSign(n: number): -1 | 1 {
  return n > 0 ? 1 : -1;
}

export function scoreGuess(guess: GuessInput, official: OfficialResult): ScoreResult {
  const exact =
    guess.homeGoals === official.homeGoals && guess.awayGoals === official.awayGoals;
  if (exact) return { points: SCORE_RULES.EXACT_SCORE, ruleApplied: 'EXACT_SCORE' };

  const guessIsDraw = guess.homeGoals === guess.awayGoals;
  const officialIsDraw = official.homeGoals === official.awayGoals;

  if (guessIsDraw && officialIsDraw) {
    return { points: SCORE_RULES.DRAW_RESULT_WRONG_SCORE, ruleApplied: 'DRAW_RESULT_WRONG_SCORE' };
  }

  const sameWinner =
    !guessIsDraw &&
    !officialIsDraw &&
    winnerSign(guess.homeGoals - guess.awayGoals) ===
      winnerSign(official.homeGoals - official.awayGoals);

  const oneGoalMatches =
    guess.homeGoals === official.homeGoals || guess.awayGoals === official.awayGoals;

  if (sameWinner) {
    return oneGoalMatches
      ? { points: SCORE_RULES.WINNER_AND_ONE_GOAL, ruleApplied: 'WINNER_AND_ONE_GOAL' }
      : { points: SCORE_RULES.WINNER_ONLY, ruleApplied: 'WINNER_ONLY' };
  }

  if (oneGoalMatches) {
    return { points: SCORE_RULES.ONE_GOAL_ONLY, ruleApplied: 'ONE_GOAL_ONLY' };
  }

  return { points: SCORE_RULES.MISS, ruleApplied: 'MISS' };
}

export function officialResultHash(official: OfficialResult): string {
  return `${official.homeGoals}-${official.awayGoals}`;
}
