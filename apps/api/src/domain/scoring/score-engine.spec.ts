import { scoreGuess, officialResultHash } from './score-engine';

describe('scoreGuess', () => {
  it('EXACT_SCORE when guess equals official', () => {
    expect(scoreGuess({ homeGoals: 2, awayGoals: 1 }, { homeGoals: 2, awayGoals: 1 }))
      .toEqual({ points: 10, ruleApplied: 'EXACT_SCORE' });
    expect(scoreGuess({ homeGoals: 0, awayGoals: 0 }, { homeGoals: 0, awayGoals: 0 }))
      .toEqual({ points: 10, ruleApplied: 'EXACT_SCORE' });
  });

  it('WINNER_AND_ONE_GOAL when home wins and home goals match exactly', () => {
    expect(scoreGuess({ homeGoals: 2, awayGoals: 0 }, { homeGoals: 2, awayGoals: 1 }))
      .toEqual({ points: 8, ruleApplied: 'WINNER_AND_ONE_GOAL' });
  });

  it('WINNER_AND_ONE_GOAL when away wins and away goals match exactly', () => {
    expect(scoreGuess({ homeGoals: 0, awayGoals: 3 }, { homeGoals: 1, awayGoals: 3 }))
      .toEqual({ points: 8, ruleApplied: 'WINNER_AND_ONE_GOAL' });
  });

  it('WINNER_ONLY when winner matches but neither goal matches', () => {
    expect(scoreGuess({ homeGoals: 3, awayGoals: 1 }, { homeGoals: 2, awayGoals: 0 }))
      .toEqual({ points: 6, ruleApplied: 'WINNER_ONLY' });
  });

  it('DRAW_RESULT_WRONG_SCORE when both predict draw but different score', () => {
    expect(scoreGuess({ homeGoals: 1, awayGoals: 1 }, { homeGoals: 2, awayGoals: 2 }))
      .toEqual({ points: 4, ruleApplied: 'DRAW_RESULT_WRONG_SCORE' });
    expect(scoreGuess({ homeGoals: 0, awayGoals: 0 }, { homeGoals: 3, awayGoals: 3 }))
      .toEqual({ points: 4, ruleApplied: 'DRAW_RESULT_WRONG_SCORE' });
  });

  it('ONE_GOAL_ONLY when wrong winner but one goal matches', () => {
    expect(scoreGuess({ homeGoals: 1, awayGoals: 2 }, { homeGoals: 1, awayGoals: 0 }))
      .toEqual({ points: 2, ruleApplied: 'ONE_GOAL_ONLY' });
    expect(scoreGuess({ homeGoals: 2, awayGoals: 1 }, { homeGoals: 0, awayGoals: 1 }))
      .toEqual({ points: 2, ruleApplied: 'ONE_GOAL_ONLY' });
  });

  it('ONE_GOAL_ONLY when guess is draw, official is decisive but home goals match', () => {
    expect(scoreGuess({ homeGoals: 1, awayGoals: 1 }, { homeGoals: 1, awayGoals: 0 }))
      .toEqual({ points: 2, ruleApplied: 'ONE_GOAL_ONLY' });
  });

  it('ONE_GOAL_ONLY when official is draw, guess is decisive but a goal matches', () => {
    expect(scoreGuess({ homeGoals: 1, awayGoals: 0 }, { homeGoals: 1, awayGoals: 1 }))
      .toEqual({ points: 2, ruleApplied: 'ONE_GOAL_ONLY' });
  });

  it('MISS when nothing matches', () => {
    expect(scoreGuess({ homeGoals: 2, awayGoals: 1 }, { homeGoals: 0, awayGoals: 3 }))
      .toEqual({ points: 0, ruleApplied: 'MISS' });
  });

  it('MISS when guess is draw and official is decisive with no shared goal', () => {
    expect(scoreGuess({ homeGoals: 2, awayGoals: 2 }, { homeGoals: 1, awayGoals: 0 }))
      .toEqual({ points: 0, ruleApplied: 'MISS' });
  });

  it('does NOT award WINNER_AND_ONE_GOAL on a draw match', () => {
    // Both predicted draw, exact score not matching → DRAW_RESULT_WRONG_SCORE (4), not 8.
    const result = scoreGuess({ homeGoals: 2, awayGoals: 2 }, { homeGoals: 0, awayGoals: 0 });
    expect(result.points).toBe(4);
    expect(result.ruleApplied).toBe('DRAW_RESULT_WRONG_SCORE');
  });

  it('is deterministic and side-effect free', () => {
    const g = { homeGoals: 2, awayGoals: 1 };
    const o = { homeGoals: 2, awayGoals: 1 };
    const r1 = scoreGuess(g, o);
    const r2 = scoreGuess(g, o);
    expect(r1).toEqual(r2);
    expect(g).toEqual({ homeGoals: 2, awayGoals: 1 });
    expect(o).toEqual({ homeGoals: 2, awayGoals: 1 });
  });
});

describe('officialResultHash', () => {
  it('produces a stable string per score', () => {
    expect(officialResultHash({ homeGoals: 2, awayGoals: 1 })).toBe('2-1');
    expect(officialResultHash({ homeGoals: 0, awayGoals: 0 })).toBe('0-0');
  });
});
