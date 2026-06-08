import type { GroupLetter } from '@bolao/shared';

/**
 * Static knockout topology for FIFA World Cup 2026 (48 teams, 12 groups).
 *
 * R32 (matches 73–88) follows the OFFICIAL FIFA bracket: each best-third
 * slot is constrained to a specific set of source groups, and the FIFA
 * lookup logic assigns each of the 8 advancing thirds to exactly one slot
 * such that no slot is empty and no two thirds collide.
 *
 * R16 → Final + 3rd-place follow the OFFICIAL FIFA 2026 bracket cross-pairings
 * (NOT a naive sequential pairing — FIFA crosses the halves specifically):
 *   R16-{89..96} = specific W(R32-*) pairs (see R16_FIXTURES)
 *   QF-{97..100} = specific W(R16-*) pairs (see QF_FIXTURES)
 *   SF-101 = W(QF-97) × W(QF-98) ; SF-102 = W(QF-99) × W(QF-100)
 *   F-104 = W(SF-101) × W(SF-102)
 *   TP-103 (3rd place) = L(SF-101) × L(SF-102)
 *
 * Total: 16 R32 + 8 R16 + 4 QF + 2 SF + Final + 3rd = 32 knockout fixtures.
 */

export type KnockoutStage = 'r32' | 'r16' | 'qf' | 'sf' | 'tp' | 'final';

export type SlotRef =
  | { kind: 'WINNER_GROUP'; group: GroupLetter }
  | { kind: 'RUNNER_UP_GROUP'; group: GroupLetter }
  | { kind: 'BEST_THIRD_FROM'; allowedGroups: GroupLetter[] }
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
const t = (allowedGroups: GroupLetter[]): SlotRef => ({ kind: 'BEST_THIRD_FROM', allowedGroups });
const wo = (fixtureId: string): SlotRef => ({ kind: 'WINNER_OF', fixtureId });
const lo = (fixtureId: string): SlotRef => ({ kind: 'LOSER_OF', fixtureId });

// R32 — matches 73..88 from FIFA's official 2026 bracket.
export const R32_FIXTURES: FixtureTemplate[] = [
  { id: 'R32-73', stage: 'r32', topSlot: r('A'), bottomSlot: r('B') },
  { id: 'R32-74', stage: 'r32', topSlot: w('E'), bottomSlot: t(['A', 'B', 'C', 'D', 'F']) },
  { id: 'R32-75', stage: 'r32', topSlot: w('F'), bottomSlot: r('C') },
  { id: 'R32-76', stage: 'r32', topSlot: w('C'), bottomSlot: r('F') },
  { id: 'R32-77', stage: 'r32', topSlot: w('I'), bottomSlot: t(['C', 'D', 'F', 'G', 'H']) },
  { id: 'R32-78', stage: 'r32', topSlot: r('E'), bottomSlot: r('I') },
  { id: 'R32-79', stage: 'r32', topSlot: w('A'), bottomSlot: t(['C', 'E', 'F', 'H', 'I']) },
  { id: 'R32-80', stage: 'r32', topSlot: w('L'), bottomSlot: t(['E', 'H', 'I', 'J', 'K']) },
  { id: 'R32-81', stage: 'r32', topSlot: w('D'), bottomSlot: t(['B', 'E', 'F', 'I', 'J']) },
  { id: 'R32-82', stage: 'r32', topSlot: w('G'), bottomSlot: t(['A', 'E', 'H', 'I', 'J']) },
  { id: 'R32-83', stage: 'r32', topSlot: r('K'), bottomSlot: r('L') },
  { id: 'R32-84', stage: 'r32', topSlot: w('H'), bottomSlot: r('J') },
  { id: 'R32-85', stage: 'r32', topSlot: w('B'), bottomSlot: t(['E', 'F', 'G', 'I', 'J']) },
  { id: 'R32-86', stage: 'r32', topSlot: w('J'), bottomSlot: r('H') },
  { id: 'R32-87', stage: 'r32', topSlot: w('K'), bottomSlot: t(['D', 'E', 'I', 'J', 'L']) },
  { id: 'R32-88', stage: 'r32', topSlot: r('D'), bottomSlot: r('G') },
];

// R16 — OFFICIAL FIFA 2026 cross-pairings (not sequential).
export const R16_FIXTURES: FixtureTemplate[] = [
  { id: 'R16-89', stage: 'r16', topSlot: wo('R32-74'), bottomSlot: wo('R32-77') },
  { id: 'R16-90', stage: 'r16', topSlot: wo('R32-73'), bottomSlot: wo('R32-75') },
  { id: 'R16-91', stage: 'r16', topSlot: wo('R32-76'), bottomSlot: wo('R32-78') },
  { id: 'R16-92', stage: 'r16', topSlot: wo('R32-79'), bottomSlot: wo('R32-80') },
  { id: 'R16-93', stage: 'r16', topSlot: wo('R32-83'), bottomSlot: wo('R32-84') },
  { id: 'R16-94', stage: 'r16', topSlot: wo('R32-81'), bottomSlot: wo('R32-82') },
  { id: 'R16-95', stage: 'r16', topSlot: wo('R32-86'), bottomSlot: wo('R32-88') },
  { id: 'R16-96', stage: 'r16', topSlot: wo('R32-85'), bottomSlot: wo('R32-87') },
];

// QF — OFFICIAL FIFA 2026 cross-pairings (J98/J99 cross the bracket halves).
export const QF_FIXTURES: FixtureTemplate[] = [
  { id: 'QF-97', stage: 'qf', topSlot: wo('R16-89'), bottomSlot: wo('R16-90') },
  { id: 'QF-98', stage: 'qf', topSlot: wo('R16-93'), bottomSlot: wo('R16-94') },
  { id: 'QF-99', stage: 'qf', topSlot: wo('R16-91'), bottomSlot: wo('R16-92') },
  { id: 'QF-100', stage: 'qf', topSlot: wo('R16-95'), bottomSlot: wo('R16-96') },
];

export const SF_FIXTURES: FixtureTemplate[] = [
  { id: 'SF-101', stage: 'sf', topSlot: wo('QF-97'), bottomSlot: wo('QF-98') },
  { id: 'SF-102', stage: 'sf', topSlot: wo('QF-99'), bottomSlot: wo('QF-100') },
];

export const THIRD_PLACE_FIXTURE: FixtureTemplate = {
  id: 'TP-103',
  stage: 'tp',
  topSlot: lo('SF-101'),
  bottomSlot: lo('SF-102'),
};

export const FINAL_FIXTURE: FixtureTemplate = {
  id: 'F-104',
  stage: 'final',
  topSlot: wo('SF-101'),
  bottomSlot: wo('SF-102'),
};

export const ALL_FIXTURES: FixtureTemplate[] = [
  ...R32_FIXTURES,
  ...R16_FIXTURES,
  ...QF_FIXTURES,
  ...SF_FIXTURES,
  THIRD_PLACE_FIXTURE,
  FINAL_FIXTURE,
];
