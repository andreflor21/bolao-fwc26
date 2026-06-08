import { RankingService } from './ranking.service';

/**
 * Foco: o DESEMPATE do ranking — pontos (desc) → placares certos/cravadas
 * (desc) → nome em ordem alfabética (asc).
 */
function makeService(opts: {
  participantIds: string[];
  /** ZSET achatado: [id, score, id, score, ...] já em ordem de score desc. */
  zset: string[];
  users: Array<{ id: string; name: string }>;
  /** exact count por userId. */
  exactByUser: Record<string, number>;
}): RankingService {
  const redis = {
    zrevrange: jest.fn(async () => opts.zset),
    mget: jest.fn(async (...keys: string[]) =>
      keys.map((k) => {
        const id = k.replace('bolao:exact:', '');
        return String(opts.exactByUser[id] ?? 0);
      }),
    ),
  };
  const prisma = {
    subscription: {
      findMany: jest.fn(async () => opts.participantIds.map((userId) => ({ userId }))),
    },
    user: {
      findMany: jest.fn(async () => opts.users),
    },
  };
  return new RankingService(redis as never, prisma as never);
}

describe('RankingService — desempate do ranking', () => {
  it('empate em pontos: ordena por placares certos (desc), depois nome (asc)', async () => {
    // Todos com 10 pts. Ana(5) e Bruno(5) à frente de Carlos(2); entre Ana e
    // Bruno (mesmas cravadas), ordem alfabética → Ana antes de Bruno.
    const svc = makeService({
      participantIds: ['A', 'B', 'C'],
      zset: ['A', '10', 'B', '10', 'C', '10'],
      users: [
        { id: 'A', name: 'Carlos' },
        { id: 'B', name: 'Bruno' },
        { id: 'C', name: 'Ana' },
      ],
      exactByUser: { A: 2, B: 5, C: 5 },
    });

    const ranking = await svc.getGeneralRanking({ limit: 100 });
    expect(ranking.rows.map((r) => r.name)).toEqual(['Ana', 'Bruno', 'Carlos']);
    expect(ranking.rows.map((r) => r.position)).toEqual([1, 2, 3]);
  });

  it('pontos diferentes mandam acima de tudo', async () => {
    const svc = makeService({
      participantIds: ['A', 'B'],
      zset: ['B', '30', 'A', '5'],
      users: [
        { id: 'A', name: 'Ana' }, // menos pontos, mais cravadas — fica abaixo
        { id: 'B', name: 'Zeca' },
      ],
      exactByUser: { A: 9, B: 0 },
    });

    const ranking = await svc.getGeneralRanking({ limit: 100 });
    expect(ranking.rows.map((r) => r.name)).toEqual(['Zeca', 'Ana']);
  });

  it('todos empatados (mesmos pontos e cravadas): ordem alfabética', async () => {
    const svc = makeService({
      participantIds: ['X', 'Y', 'Z'],
      zset: ['Z', '7', 'Y', '7', 'X', '7'],
      users: [
        { id: 'X', name: 'Tiago' },
        { id: 'Y', name: 'Mariana' },
        { id: 'Z', name: 'André' },
      ],
      exactByUser: { X: 1, Y: 1, Z: 1 },
    });

    const ranking = await svc.getGeneralRanking({ limit: 100 });
    expect(ranking.rows.map((r) => r.name)).toEqual(['André', 'Mariana', 'Tiago']);
  });
});
