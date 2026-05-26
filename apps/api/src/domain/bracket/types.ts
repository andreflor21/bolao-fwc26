import type { GroupLetter } from '@bolao/shared';

export interface GroupMatchResult {
  homeTeamCode: string;
  awayTeamCode: string;
  homeGoals: number;
  awayGoals: number;
}

export interface GroupStanding {
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
  fifaRank: number;
}

export type FifaRanks = Record<string, number>;
