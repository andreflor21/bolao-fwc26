import {
  scorePlayerKnockoutFixture,
  deriveAdvancer,
  type OfficialKnockoutResult,
} from './knockout-player-scoring';

const official: OfficialKnockoutResult = {
  fixtureId: 'R32-73',
  topTeamCode: 'BRA',
  bottomTeamCode: 'ARG',
  topGoals: 2,
  bottomGoals: 1,
};

describe('scorePlayerKnockoutFixture', () => {
  it('sem palpite → zero', () => {
    const r = scorePlayerKnockoutFixture(official, undefined);
    expect(r).toEqual({ fixtureId: 'R32-73', teamPoints: 0, scorePoints: 0, points: 0 });
  });

  it('ambos os times certos + placar exato = 15+15+10 = 40 (máximo)', () => {
    const r = scorePlayerKnockoutFixture(official, {
      topTeamCode: 'BRA',
      bottomTeamCode: 'ARG',
      topGoals: 2,
      bottomGoals: 1,
    });
    expect(r.teamPoints).toBe(30);
    expect(r.scorePoints).toBe(10);
    expect(r.points).toBe(40);
  });

  it('ambos os times certos, placar errado mas vencedor certo → 30 + pontos de placar', () => {
    const r = scorePlayerKnockoutFixture(official, {
      topTeamCode: 'BRA',
      bottomTeamCode: 'ARG',
      topGoals: 3,
      bottomGoals: 0,
    });
    expect(r.teamPoints).toBe(30);
    expect(r.scorePoints).toBeGreaterThan(0); // acertou o vencedor
    expect(r.points).toBe(30 + r.scorePoints);
  });

  it('só um time certo → 15 e nenhum ponto de placar', () => {
    const r = scorePlayerKnockoutFixture(official, {
      topTeamCode: 'BRA',
      bottomTeamCode: 'URU',
      topGoals: 2,
      bottomGoals: 1,
    });
    expect(r.teamPoints).toBe(15);
    expect(r.scorePoints).toBe(0);
    expect(r.points).toBe(15);
  });

  it('time certo mas no slot trocado → não pontua aquele slot', () => {
    const r = scorePlayerKnockoutFixture(official, {
      topTeamCode: 'ARG', // inverteu
      bottomTeamCode: 'BRA',
      topGoals: 1,
      bottomGoals: 2,
    });
    expect(r.teamPoints).toBe(0);
    expect(r.points).toBe(0);
  });
});

describe('deriveAdvancer', () => {
  it('vitória do mandante', () => {
    expect(deriveAdvancer('BRA', 'ARG', 2, 1, null)).toBe('BRA');
  });
  it('vitória do visitante', () => {
    expect(deriveAdvancer('BRA', 'ARG', 0, 1, null)).toBe('ARG');
  });
  it('empate usa advancesTeamCode', () => {
    expect(deriveAdvancer('BRA', 'ARG', 1, 1, 'ARG')).toBe('ARG');
  });
  it('empate sem advancesTeamCode válido → null', () => {
    expect(deriveAdvancer('BRA', 'ARG', 1, 1, 'URU')).toBeNull();
    expect(deriveAdvancer('BRA', 'ARG', 1, 1, null)).toBeNull();
  });
});
