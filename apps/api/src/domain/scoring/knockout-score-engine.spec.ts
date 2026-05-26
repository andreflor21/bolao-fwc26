import { scoreKnockoutGuess } from './knockout-score-engine';

const OFFICIAL = {
  topTeamCode: 'BRA',
  bottomTeamCode: 'ARG',
  topGoals: 2,
  bottomGoals: 1,
};

describe('scoreKnockoutGuess', () => {
  it('awards 40 pts max — both teams correct + exact score', () => {
    const r = scoreKnockoutGuess(
      { topTeamCode: 'BRA', bottomTeamCode: 'ARG', topGoals: 2, bottomGoals: 1 },
      OFFICIAL,
    );
    expect(r).toEqual({
      teamPoints: 30,
      scorePoints: 10,
      totalPoints: 40,
      breakdown: {
        topTeamHit: true,
        bottomTeamHit: true,
        bothTeamsHit: true,
        scoreRule: 'EXACT_SCORE',
      },
    });
  });

  it('30 + 8 = 38 — both teams correct, winner + one goal right', () => {
    const r = scoreKnockoutGuess(
      { topTeamCode: 'BRA', bottomTeamCode: 'ARG', topGoals: 2, bottomGoals: 0 },
      OFFICIAL,
    );
    expect(r.teamPoints).toBe(30);
    expect(r.scorePoints).toBe(8);
    expect(r.totalPoints).toBe(38);
    expect(r.breakdown.scoreRule).toBe('WINNER_AND_ONE_GOAL');
  });

  it('30 + 6 = 36 — both teams correct, winner only (no goal matches)', () => {
    const r = scoreKnockoutGuess(
      { topTeamCode: 'BRA', bottomTeamCode: 'ARG', topGoals: 3, bottomGoals: 2 },
      OFFICIAL,
    );
    expect(r.totalPoints).toBe(36);
    expect(r.breakdown.scoreRule).toBe('WINNER_ONLY');
  });

  it('30 + 0 = 30 — both teams correct, wrong winner direction', () => {
    const r = scoreKnockoutGuess(
      { topTeamCode: 'BRA', bottomTeamCode: 'ARG', topGoals: 0, bottomGoals: 3 },
      OFFICIAL,
    );
    expect(r.teamPoints).toBe(30);
    expect(r.scorePoints).toBe(0);
    expect(r.totalPoints).toBe(30);
    expect(r.breakdown.scoreRule).toBe('MISS');
  });

  it('15 pts — only top team correct, score ignored', () => {
    const r = scoreKnockoutGuess(
      { topTeamCode: 'BRA', bottomTeamCode: 'WRONG', topGoals: 2, bottomGoals: 1 },
      OFFICIAL,
    );
    expect(r.teamPoints).toBe(15);
    expect(r.scorePoints).toBe(0);
    expect(r.totalPoints).toBe(15);
    expect(r.breakdown.bothTeamsHit).toBe(false);
    expect(r.breakdown.scoreRule).toBeNull();
  });

  it('15 pts — only bottom team correct, score ignored', () => {
    const r = scoreKnockoutGuess(
      { topTeamCode: 'WRONG', bottomTeamCode: 'ARG', topGoals: 2, bottomGoals: 1 },
      OFFICIAL,
    );
    expect(r.teamPoints).toBe(15);
    expect(r.totalPoints).toBe(15);
  });

  it('0 pts — both teams wrong', () => {
    const r = scoreKnockoutGuess(
      { topTeamCode: 'X', bottomTeamCode: 'Y', topGoals: 2, bottomGoals: 1 },
      OFFICIAL,
    );
    expect(r.teamPoints).toBe(0);
    expect(r.scorePoints).toBe(0);
    expect(r.totalPoints).toBe(0);
  });

  it('does NOT award score points when both teams are correct but in swapped slots', () => {
    // User predicted ARG on top, BRA on bottom — official is the reverse.
    // teamCode matching is slot-positional → both teams "wrong" in their slots.
    const r = scoreKnockoutGuess(
      { topTeamCode: 'ARG', bottomTeamCode: 'BRA', topGoals: 1, bottomGoals: 2 },
      OFFICIAL,
    );
    expect(r.teamPoints).toBe(0);
    expect(r.scorePoints).toBe(0);
    expect(r.totalPoints).toBe(0);
  });

  it('null prediction never matches', () => {
    const r = scoreKnockoutGuess(
      { topTeamCode: null, bottomTeamCode: null, topGoals: 2, bottomGoals: 1 },
      OFFICIAL,
    );
    expect(r.totalPoints).toBe(0);
  });

  it('30 + 4 = 34 — both teams correct, both predicted draw with wrong score', () => {
    const official = {
      topTeamCode: 'GER',
      bottomTeamCode: 'FRA',
      topGoals: 2,
      bottomGoals: 2,
    };
    const r = scoreKnockoutGuess(
      { topTeamCode: 'GER', bottomTeamCode: 'FRA', topGoals: 1, bottomGoals: 1 },
      official,
    );
    expect(r.teamPoints).toBe(30);
    expect(r.scorePoints).toBe(4);
    expect(r.totalPoints).toBe(34);
    expect(r.breakdown.scoreRule).toBe('DRAW_RESULT_WRONG_SCORE');
  });

  it('is deterministic and side-effect free', () => {
    const g = { topTeamCode: 'BRA', bottomTeamCode: 'ARG', topGoals: 2, bottomGoals: 1 };
    const o = { ...OFFICIAL };
    const r1 = scoreKnockoutGuess(g, o);
    const r2 = scoreKnockoutGuess(g, o);
    expect(r1).toEqual(r2);
    expect(g).toEqual({ topTeamCode: 'BRA', bottomTeamCode: 'ARG', topGoals: 2, bottomGoals: 1 });
  });
});
