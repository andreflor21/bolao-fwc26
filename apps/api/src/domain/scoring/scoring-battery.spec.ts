import { scoreGuess } from './score-engine';

/**
 * "Bateria" de pontuação: vários jogadores com palpites diferentes contra um
 * resultado oficial, validando cada regra e a ordenação final do leaderboard.
 */
describe('Bateria de scoring — vários jogadores, um resultado', () => {
  it('cobre todas as regras para um resultado 3x1 (vitória do mandante)', () => {
    const official = { homeGoals: 3, awayGoals: 1 };
    expect(scoreGuess({ homeGoals: 3, awayGoals: 1 }, official)).toEqual({
      points: 10,
      ruleApplied: 'EXACT_SCORE',
    });
    // mesmo vencedor + gol do visitante (1) bate
    expect(scoreGuess({ homeGoals: 2, awayGoals: 1 }, official)).toEqual({
      points: 8,
      ruleApplied: 'WINNER_AND_ONE_GOAL',
    });
    // mesmo vencedor, nenhum gol bate
    expect(scoreGuess({ homeGoals: 4, awayGoals: 2 }, official)).toEqual({
      points: 6,
      ruleApplied: 'WINNER_ONLY',
    });
    // vencedor errado, mas gol do visitante (1) bate
    expect(scoreGuess({ homeGoals: 0, awayGoals: 1 }, official)).toEqual({
      points: 2,
      ruleApplied: 'ONE_GOAL_ONLY',
    });
    // nada bate
    expect(scoreGuess({ homeGoals: 0, awayGoals: 0 }, official)).toEqual({
      points: 0,
      ruleApplied: 'MISS',
    });
  });

  it('empate com placar errado pontua DRAW_RESULT_WRONG_SCORE', () => {
    const official = { homeGoals: 2, awayGoals: 2 };
    expect(scoreGuess({ homeGoals: 1, awayGoals: 1 }, official)).toEqual({
      points: 4,
      ruleApplied: 'DRAW_RESULT_WRONG_SCORE',
    });
    expect(scoreGuess({ homeGoals: 2, awayGoals: 2 }, official)).toEqual({
      points: 10,
      ruleApplied: 'EXACT_SCORE',
    });
  });

  it('leaderboard: soma de 2 jogos ordena os jogadores corretamente', () => {
    const results = [
      { homeGoals: 3, awayGoals: 1 },
      { homeGoals: 0, awayGoals: 0 },
    ];
    const players: Record<string, Array<{ homeGoals: number; awayGoals: number }>> = {
      Ana: [
        { homeGoals: 3, awayGoals: 1 }, // exato 10
        { homeGoals: 0, awayGoals: 0 }, // exato 10
      ],
      Bruno: [
        { homeGoals: 2, awayGoals: 1 }, // winner+gol 8
        { homeGoals: 1, awayGoals: 1 }, // empate placar errado 4
      ],
      Caio: [
        { homeGoals: 0, awayGoals: 2 }, // miss 0
        { homeGoals: 2, awayGoals: 1 }, // miss 0
      ],
    };
    const totals = Object.entries(players)
      .map(([name, guesses]) => ({
        name,
        points: guesses.reduce((sum, g, i) => sum + scoreGuess(g, results[i]).points, 0),
      }))
      .sort((a, b) => b.points - a.points);

    expect(totals).toEqual([
      { name: 'Ana', points: 20 },
      { name: 'Bruno', points: 12 },
      { name: 'Caio', points: 0 },
    ]);
  });
});
