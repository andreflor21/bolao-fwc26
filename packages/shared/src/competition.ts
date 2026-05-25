export const FIFA_WC_2026_ID = 'fifa-wc-2026';

export type ClosureStatus = 'open' | 'locked' | 'finalized';

export interface CompetitionDto {
  id: string;
  name: string;
  locksAt: string;
  endsAt: string;
  closureStatus: ClosureStatus;
}
