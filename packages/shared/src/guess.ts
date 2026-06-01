import type { BracketFixtureDto } from './bracket';
import type { MatchDto } from './match';
import type { ScoreRule } from './scoring';

/** Pontuação de um palpite após o resultado oficial ter sido lançado. */
export interface GuessScoreDto {
  points: number;
  ruleApplied: ScoreRule;
}

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
  /** Preenchido quando o jogo já tem resultado oficial; null caso contrário. */
  score: GuessScoreDto | null;
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
export const KNOCKOUT_STAGE_FIXTURE_COUNT = 32;

export interface KnockoutScoreInputDto {
  fixtureId: string;
  homeGoals: number;
  awayGoals: number;
  /**
   * Required when `homeGoals === awayGoals` (knockouts can't end in a draw —
   * the player must declare which team advances so the next round can be
   * resolved). Must be either the top or bottom team code of the fixture.
   */
  advancesTeamCode?: string | null;
}

export interface SaveKnockoutScoresDto {
  scores: KnockoutScoreInputDto[];
}

export interface KnockoutScoreEntryDto {
  homeGoals: number;
  awayGoals: number;
  advancesTeamCode?: string | null;
}

/** Pontos que o jogador fez num confronto de mata-mata (após o resultado). */
export interface KnockoutFixtureScoreDto {
  points: number;
  teamPoints: number;
  scorePoints: number;
}

/** Resultado oficial de um confronto de mata-mata. */
export interface KnockoutOfficialResultDto {
  /** Times REAIS que jogaram (podem diferir do palpite do jogador). */
  homeTeamCode: string | null;
  awayTeamCode: string | null;
  homeGoals: number;
  awayGoals: number;
  advancesTeamCode: string | null;
}

export interface MyKnockoutGuessesDto {
  /** All 32 knockout fixtures (with predicted teams resolved). */
  fixtures: BracketFixtureDto[];
  /** Current per-fixture score predictions keyed by fixtureId. */
  scores: Record<string, KnockoutScoreEntryDto>;
  /** Pontos que o jogador fez por confronto, keyed by fixtureId (após resultado). */
  points: Record<string, KnockoutFixtureScoreDto>;
  /** Resultado oficial por confronto, keyed by fixtureId (quando já lançado). */
  officialResults: Record<string, KnockoutOfficialResultDto>;
  /** True once the user has finalised their knockout submission. */
  submittedAt: string | null;
  /** Whether the knockout phase still accepts edits. */
  isOpen: boolean;
  /** Lock timestamp (ISO 8601 UTC) — 1 h before the first KO match. */
  locksAt: string;
  /** Whether group palpites have been submitted (precondition for KO scoring). */
  groupSubmitted: boolean;
}
