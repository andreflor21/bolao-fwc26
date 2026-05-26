import type { MatchDto } from './match';

export interface GroupGuessInputDto {
  matchId: string;
  homeGoals: number;
  awayGoals: number;
}

export interface SaveDraftGuessesDto {
  guesses: GroupGuessInputDto[];
}

export interface GuessDto {
  matchId: string;
  homeGoals: number;
  awayGoals: number;
  isDerived: boolean;
  submittedAt: string | null;
  updatedAt: string;
}

export interface GuessWithMatchDto extends GuessDto {
  match: MatchDto;
}

export interface MyGuessesDto {
  /** Guesses keyed by matchId for fast O(1) lookup in the UI. */
  guesses: Record<string, GuessDto>;
  /** Set once the user finalises their submission; null while editing drafts. */
  submittedAt: string | null;
  /** Server-side lock timestamp (ISO 8601 UTC). UI must enforce read-only after this. */
  locksAt: string;
  /** Whether the competition is currently accepting new edits. */
  isOpen: boolean;
}

export const GUESS_GOAL_MIN = 0;
export const GUESS_GOAL_MAX = 15;
export const GROUP_STAGE_MATCH_COUNT = 72;
