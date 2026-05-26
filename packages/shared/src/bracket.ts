import type { GroupLetter, MatchStage } from './match';

export type KnockoutStage = Exclude<MatchStage, 'group'>;

export type SlotResolution =
  | { kind: 'WINNER_GROUP'; group: GroupLetter }
  | { kind: 'RUNNER_UP_GROUP'; group: GroupLetter }
  | { kind: 'BEST_THIRD'; rank: 1 | 2 | 3 | 4 | 5 | 6 | 7 | 8 }
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

export interface BracketPreviewDto {
  /** Standings of all 12 groups, each ordered 1st to 4th. */
  groups: Record<GroupLetter, GroupStandingDto[]>;
  /** Best 8 third-placed teams, ranked. */
  bestThirds: Array<GroupStandingDto & { bestThirdRank: 1 | 2 | 3 | 4 | 5 | 6 | 7 | 8 }>;
  /** Full 32-fixture knockout bracket with predicted outcomes. */
  fixtures: BracketFixtureDto[];
}
