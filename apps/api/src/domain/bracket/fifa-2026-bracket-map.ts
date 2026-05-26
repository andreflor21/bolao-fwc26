import type { GroupLetter } from '@bolao/shared';

/**
 * Static R32-to-Final topology for FIFA World Cup 2026 (48 teams, 12 groups).
 *
 * PROPOSAL — FIFA has not published the official 2026 KO bracket assignment
 * for 12 groups × 4 teams at the time of writing. This mapping satisfies the
 * structural rules:
 *
 *   - 12 group winners (1A..1L), 12 runners-up (2A..2L), 8 best thirds (BT1..8)
 *   - Exactly 32 teams flow into R32 → R16 → QF → SF → Final + 3rd-place
 *   - No same-group conflict in R32 (guaranteed) — beyond R32 cannot be
 *     guaranteed without the official seeding tables.
 *
 * REVISIT before launch (2026-06-11): swap the constants below with the
 * official mapping once FIFA publishes it.
 */

export type KnockoutStage = 'r32' | 'r16' | 'qf' | 'sf' | 'tp' | 'final';

export type SlotRef =
  | { kind: 'WINNER_GROUP'; group: GroupLetter }
  | { kind: 'RUNNER_UP_GROUP'; group: GroupLetter }
  | { kind: 'BEST_THIRD'; rank: 1 | 2 | 3 | 4 | 5 | 6 | 7 | 8 }
  | { kind: 'WINNER_OF'; fixtureId: string }
  | { kind: 'LOSER_OF'; fixtureId: string };

export interface FixtureTemplate {
  id: string;
  stage: KnockoutStage;
  topSlot: SlotRef;
  bottomSlot: SlotRef;
}

const w = (group: GroupLetter): SlotRef => ({ kind: 'WINNER_GROUP', group });
const r = (group: GroupLetter): SlotRef => ({ kind: 'RUNNER_UP_GROUP', group });
const t = (rank: 1 | 2 | 3 | 4 | 5 | 6 | 7 | 8): SlotRef => ({ kind: 'BEST_THIRD', rank });
const wo = (fixtureId: string): SlotRef => ({ kind: 'WINNER_OF', fixtureId });
const lo = (fixtureId: string): SlotRef => ({ kind: 'LOSER_OF', fixtureId });

export const R32_FIXTURES: FixtureTemplate[] = [
  // 8 winner-vs-best-third (cleanly avoids same-group early meetings)
  { id: 'R32-01', stage: 'r32', topSlot: w('A'), bottomSlot: t(1) },
  { id: 'R32-02', stage: 'r32', topSlot: w('B'), bottomSlot: t(2) },
  { id: 'R32-03', stage: 'r32', topSlot: w('C'), bottomSlot: t(3) },
  { id: 'R32-04', stage: 'r32', topSlot: w('D'), bottomSlot: t(4) },
  { id: 'R32-05', stage: 'r32', topSlot: w('E'), bottomSlot: t(5) },
  { id: 'R32-06', stage: 'r32', topSlot: w('F'), bottomSlot: t(6) },
  { id: 'R32-07', stage: 'r32', topSlot: w('G'), bottomSlot: t(7) },
  { id: 'R32-08', stage: 'r32', topSlot: w('H'), bottomSlot: t(8) },
  // 4 winner-vs-runner-up (cross-group to avoid same-group)
  { id: 'R32-09', stage: 'r32', topSlot: w('I'), bottomSlot: r('A') },
  { id: 'R32-10', stage: 'r32', topSlot: w('J'), bottomSlot: r('B') },
  { id: 'R32-11', stage: 'r32', topSlot: w('K'), bottomSlot: r('C') },
  { id: 'R32-12', stage: 'r32', topSlot: w('L'), bottomSlot: r('D') },
  // 4 runner-up-vs-runner-up
  { id: 'R32-13', stage: 'r32', topSlot: r('E'), bottomSlot: r('F') },
  { id: 'R32-14', stage: 'r32', topSlot: r('G'), bottomSlot: r('H') },
  { id: 'R32-15', stage: 'r32', topSlot: r('I'), bottomSlot: r('J') },
  { id: 'R32-16', stage: 'r32', topSlot: r('K'), bottomSlot: r('L') },
];

export const R16_FIXTURES: FixtureTemplate[] = [
  { id: 'R16-01', stage: 'r16', topSlot: wo('R32-01'), bottomSlot: wo('R32-02') },
  { id: 'R16-02', stage: 'r16', topSlot: wo('R32-03'), bottomSlot: wo('R32-04') },
  { id: 'R16-03', stage: 'r16', topSlot: wo('R32-05'), bottomSlot: wo('R32-06') },
  { id: 'R16-04', stage: 'r16', topSlot: wo('R32-07'), bottomSlot: wo('R32-08') },
  { id: 'R16-05', stage: 'r16', topSlot: wo('R32-09'), bottomSlot: wo('R32-10') },
  { id: 'R16-06', stage: 'r16', topSlot: wo('R32-11'), bottomSlot: wo('R32-12') },
  { id: 'R16-07', stage: 'r16', topSlot: wo('R32-13'), bottomSlot: wo('R32-14') },
  { id: 'R16-08', stage: 'r16', topSlot: wo('R32-15'), bottomSlot: wo('R32-16') },
];

export const QF_FIXTURES: FixtureTemplate[] = [
  { id: 'QF-01', stage: 'qf', topSlot: wo('R16-01'), bottomSlot: wo('R16-02') },
  { id: 'QF-02', stage: 'qf', topSlot: wo('R16-03'), bottomSlot: wo('R16-04') },
  { id: 'QF-03', stage: 'qf', topSlot: wo('R16-05'), bottomSlot: wo('R16-06') },
  { id: 'QF-04', stage: 'qf', topSlot: wo('R16-07'), bottomSlot: wo('R16-08') },
];

export const SF_FIXTURES: FixtureTemplate[] = [
  { id: 'SF-01', stage: 'sf', topSlot: wo('QF-01'), bottomSlot: wo('QF-02') },
  { id: 'SF-02', stage: 'sf', topSlot: wo('QF-03'), bottomSlot: wo('QF-04') },
];

export const FINAL_FIXTURE: FixtureTemplate = {
  id: 'FINAL',
  stage: 'final',
  topSlot: wo('SF-01'),
  bottomSlot: wo('SF-02'),
};

export const THIRD_PLACE_FIXTURE: FixtureTemplate = {
  id: 'TP',
  stage: 'tp',
  topSlot: lo('SF-01'),
  bottomSlot: lo('SF-02'),
};

export const ALL_FIXTURES: FixtureTemplate[] = [
  ...R32_FIXTURES,
  ...R16_FIXTURES,
  ...QF_FIXTURES,
  ...SF_FIXTURES,
  FINAL_FIXTURE,
  THIRD_PLACE_FIXTURE,
];
