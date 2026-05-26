import type { GroupLetter, MatchStage } from './match';

export type KnockoutStage = Exclude<MatchStage, 'group'>;

export type SlotResolution =
  | { kind: 'WINNER_GROUP'; group: GroupLetter }
  | { kind: 'RUNNER_UP_GROUP'; group: GroupLetter }
  | { kind: 'BEST_THIRD_FROM'; allowedGroups: GroupLetter[] }
  | { kind: 'WINNER_OF'; fixtureId: string }
  | { kind: 'LOSER_OF'; fixtureId: string };

export interface BracketFixtureDto {
  id: string;
  stage: KnockoutStage;
  /** Description of where each slot's team comes from. */
  topSlot: SlotResolution;
  bottomSlot: SlotResolution;
  /** Resolved team codes (null when a referenced predecessor cannot resolve). */
  topTeamCode: string | null;
  bottomTeamCode: string | null;
  /** Predicted winner / loser based on a deterministic seed cascade. */
  predictedWinnerCode: string | null;
  predictedLoserCode: string | null;
}

export interface GroupStandingDto {
  teamCode: string;
  groupLetter: GroupLetter;
  position: 1 | 2 | 3 | 4;
  played: number;
  won: number;
  drawn: number;
  lost: number;
  goalsFor: number;
  goalsAgainst: number;
  goalDifference: number;
  points: number;
}

export interface UnresolvedTieDto {
  groupLetter: GroupLetter;
  /** 2+ team codes that remained tied after every automatic criterion. */
  teamCodes: string[];
  /**
   * Position range these teams occupy within the group after the cascade
   * decided everyone else (e.g. [2,3] means the 2nd and 3rd places are
   * still up for grabs and the user must pick which is which).
   */
  positions: number[];
}

export interface BracketPreviewDto {
  /** Standings of all 12 groups, each ordered 1st to 4th. */
  groups: Record<GroupLetter, GroupStandingDto[]>;
  /** Best 8 third-placed teams, ranked. */
  bestThirds: Array<GroupStandingDto & { bestThirdRank: 1 | 2 | 3 | 4 | 5 | 6 | 7 | 8 }>;
  /** Full 32-fixture knockout bracket with predicted outcomes. */
  fixtures: BracketFixtureDto[];
  /**
   * Tied team subsets the engine couldn't resolve via H2H + overall stats.
   * The UI surfaces a "resolver empate" widget so the player can supply an
   * explicit order; FIFA rank is the fallback used until they do.
   */
  unresolvedTies: UnresolvedTieDto[];
}
