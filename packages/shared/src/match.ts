export type MatchStage = 'group' | 'r32' | 'r16' | 'qf' | 'sf' | 'tp' | 'final';

export type GroupLetter =
  | 'A' | 'B' | 'C' | 'D' | 'E' | 'F'
  | 'G' | 'H' | 'I' | 'J' | 'K' | 'L';

export const GROUP_LETTERS: GroupLetter[] = [
  'A', 'B', 'C', 'D', 'E', 'F', 'G', 'H', 'I', 'J', 'K', 'L',
];

export interface MatchDto {
  id: string;
  stage: MatchStage;
  groupLetter: GroupLetter | null;
  kickoffAt: string;
  city: string | null;
  homeTeamCode: string | null;
  awayTeamCode: string | null;
  homeGoalsOfficial: number | null;
  awayGoalsOfficial: number | null;
}

export interface TeamDto {
  id: string;
  code: string;
  name: string;
  groupLetter: GroupLetter | null;
  seededRank: number;
  flagUrl: string | null;
}
