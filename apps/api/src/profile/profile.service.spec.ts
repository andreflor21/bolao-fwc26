import { ForbiddenException, NotFoundException } from '@nestjs/common';
import { ProfileService } from './profile.service';

interface MatchRow {
  id: string;
  groupLetter: string | null;
  roundNumber: number | null;
  kickoffAt: Date;
  homeTeam: { code: string; name: string } | null;
  awayTeam: { code: string; name: string } | null;
  homeGoalsOfficial: number | null;
  awayGoalsOfficial: number | null;
  resultLockedAt: Date | null;
}

function buildPrisma(opts: {
  matches: MatchRow[];
  guesses: Array<{ matchId: string; homeGoals: number; awayGoals: number; score?: { points: number; ruleApplied: string } }>;
  targetUser?: { id: string; name: string } | null;
  requesterSub?: { status: 'active' | 'pending_payment' | 'refunded' } | null;
  targetSub?: { status: 'active' | 'pending_payment' | 'refunded' } | null;
}) {
  return {
    match: {
      findMany: jest.fn(async () => opts.matches),
    },
    guess: {
      findMany: jest.fn(async () =>
        opts.guesses.map((g) => ({
          matchId: g.matchId,
          homeGoals: g.homeGoals,
          awayGoals: g.awayGoals,
          score: g.score ?? null,
        })),
      ),
    },
    user: {
      findUnique: jest.fn(async () => opts.targetUser ?? null),
    },
    subscription: {
      findUnique: jest.fn(async ({ where }: { where: { userId_competitionId: { userId: string } } }) => {
        if (where.userId_competitionId.userId === 'requester') return opts.requesterSub ?? null;
        return opts.targetSub ?? null;
      }),
      findMany: jest.fn(async () => []),
    },
    bracketPrediction: {
      findUnique: jest.fn(async () => null),
    },
    knockoutGuessScore: {
      findMany: jest.fn(async () => []),
    },
  } as never;
}

/** Trava geral mockada — por padrão no futuro (competição ainda não travada). */
function buildCompetition(lockAt: Date = new Date(Date.now() + 24 * 60 * 60 * 1000)) {
  return {
    getLockAt: jest.fn(async () => lockAt),
  } as never;
}

function buildRedis(values: Record<string, string | number | null> = {}) {
  return {
    zscore: jest.fn(async (_key: string, member: string) => {
      const v = values[`zscore:${member}`];
      return v == null ? null : String(v);
    }),
    get: jest.fn(async (key: string) => {
      const v = values[key];
      return v == null ? null : String(v);
    }),
    pipeline: jest.fn(() => ({
      zscore: jest.fn().mockReturnThis(),
      get: jest.fn().mockReturnThis(),
      exec: jest.fn(async () => [] as Array<[Error | null, unknown]>),
    })),
  } as never;
}

describe('ProfileService.getGroupGuesses — lock visibility', () => {
  const past = new Date(Date.now() - 60 * 60 * 1000); // 1h atrás → travado
  const future = new Date(Date.now() + 6 * 60 * 60 * 1000); // 6h à frente → aberto

  const matches: MatchRow[] = [
    {
      id: 'm-past',
      groupLetter: 'A',
      roundNumber: 1,
      kickoffAt: past,
      homeTeam: { code: 'BRA', name: 'Brasil' },
      awayTeam: { code: 'ARG', name: 'Argentina' },
      homeGoalsOfficial: 2,
      awayGoalsOfficial: 1,
      resultLockedAt: past,
    },
    {
      id: 'm-future',
      groupLetter: 'B',
      roundNumber: 2,
      kickoffAt: future,
      homeTeam: { code: 'FRA', name: 'França' },
      awayTeam: { code: 'GER', name: 'Alemanha' },
      homeGoalsOfficial: null,
      awayGoalsOfficial: null,
      resultLockedAt: null,
    },
  ];

  const guesses = [
    {
      matchId: 'm-past',
      homeGoals: 2,
      awayGoals: 1,
      score: { points: 10, ruleApplied: 'EXACT_SCORE' },
    },
    { matchId: 'm-future', homeGoals: 1, awayGoals: 0 },
  ];

  it('outro participante: revela só palpites de jogos já travados', async () => {
    const prisma = buildPrisma({
      matches,
      guesses,
      targetUser: { id: 'target', name: 'Outro' },
      requesterSub: { status: 'active' },
      targetSub: { status: 'active' },
    });
    const redis = buildRedis({ 'zscore:target': 10, 'bolao:exact:target': 1 });
    const svc = new ProfileService(prisma, buildCompetition(), redis);

    const res = await svc.getGroupGuesses('requester', 'target');
    const byId = new Map(res.matches.map((m) => [m.matchId, m]));
    expect(byId.get('m-past')?.guess).toEqual({
      homeGoals: 2,
      awayGoals: 1,
      points: 10,
      ruleApplied: 'EXACT_SCORE',
    });
    expect(byId.get('m-future')?.guess).toBeNull();
    expect(byId.get('m-future')?.isLocked).toBe(false);
  });

  it('competição já travada: revela palpites de TODOS os jogos, mesmo os que não começaram', async () => {
    const prisma = buildPrisma({
      matches,
      guesses,
      targetUser: { id: 'target', name: 'Outro' },
      requesterSub: { status: 'active' },
      targetSub: { status: 'active' },
    });
    const redis = buildRedis({ 'zscore:target': 10, 'bolao:exact:target': 1 });
    // Trava geral no passado → competição travada → tudo aberto.
    const lockedComp = buildCompetition(new Date(Date.now() - 60 * 60 * 1000));
    const svc = new ProfileService(prisma, lockedComp, redis);

    const res = await svc.getGroupGuesses('requester', 'target');
    const byId = new Map(res.matches.map((m) => [m.matchId, m]));
    expect(byId.get('m-future')?.guess?.homeGoals).toBe(1);
    expect(byId.get('m-future')?.isLocked).toBe(false);
  });

  it('próprio dono: vê todos os palpites independente do lock', async () => {
    const prisma = buildPrisma({
      matches,
      guesses,
      targetUser: { id: 'requester', name: 'Eu' },
      requesterSub: { status: 'active' },
      targetSub: { status: 'active' },
    });
    const redis = buildRedis();
    const svc = new ProfileService(prisma, buildCompetition(), redis);
    const res = await svc.getGroupGuesses('requester', 'requester');
    const byId = new Map(res.matches.map((m) => [m.matchId, m]));
    expect(byId.get('m-past')?.guess?.homeGoals).toBe(2);
    expect(byId.get('m-future')?.guess?.homeGoals).toBe(1);
    expect(res.header.isSelf).toBe(true);
  });

  it('requester sem subscription ativa → ForbiddenException', async () => {
    const prisma = buildPrisma({
      matches,
      guesses,
      targetUser: { id: 'target', name: 'Outro' },
      requesterSub: { status: 'pending_payment' },
      targetSub: { status: 'active' },
    });
    const svc = new ProfileService(prisma, buildCompetition(), buildRedis());
    await expect(svc.getGroupGuesses('requester', 'target')).rejects.toThrow(ForbiddenException);
  });

  it('target inexistente → NotFoundException', async () => {
    const prisma = buildPrisma({
      matches,
      guesses,
      targetUser: null,
      requesterSub: { status: 'active' },
      targetSub: { status: 'active' },
    });
    const svc = new ProfileService(prisma, buildCompetition(), buildRedis());
    await expect(svc.getGroupGuesses('requester', 'target')).rejects.toThrow(NotFoundException);
  });
});

describe('ProfileService.getRankingEvolution', () => {
  // Dois jogos encerrados em ordem cronológica. m1 (grupo) e m2 (mata-mata).
  const t1 = new Date('2026-06-12T18:00:00Z');
  const t2 = new Date('2026-06-13T18:00:00Z');

  function buildEvolutionPrisma() {
    const users: Record<string, { id: string; name: string }> = {
      requester: { id: 'requester', name: 'Eu' },
      target: { id: 'target', name: 'Alvo' },
    };
    return {
      user: {
        findUnique: jest.fn(async ({ where }: { where: { id: string } }) => users[where.id] ?? null),
      },
      subscription: {
        findUnique: jest.fn(async () => ({ status: 'active' })),
        findMany: jest.fn(async () => [
          { userId: 'requester' },
          { userId: 'target' },
          { userId: 'other' },
        ]),
      },
      match: {
        findMany: jest.fn(async () => [
          {
            id: 'm1',
            bracketFixtureId: null,
            kickoffAt: t1,
            homeGoalsOfficial: 2,
            awayGoalsOfficial: 1,
            homeTeam: { code: 'BRA' },
            awayTeam: { code: 'SRB' },
          },
          // Jogo não encerrado no meio do calendário → vira o nº 2, mas NÃO é
          // checkpoint; o próximo encerrado mantém o nº 3.
          {
            id: 'm-pending',
            bracketFixtureId: null,
            kickoffAt: new Date('2026-06-12T21:00:00Z'),
            homeGoalsOfficial: null,
            awayGoalsOfficial: null,
            homeTeam: { code: 'FRA' },
            awayTeam: { code: 'GER' },
          },
          {
            id: 'm2',
            bracketFixtureId: 'R32-73',
            kickoffAt: t2,
            homeGoalsOfficial: 1,
            awayGoalsOfficial: 0,
            homeTeam: { code: 'ARG' },
            awayTeam: { code: 'MEX' },
          },
        ]),
      },
      guessScore: {
        findMany: jest.fn(async () => [
          { points: 5, guess: { userId: 'target', matchId: 'm1' } },
          { points: 3, guess: { userId: 'requester', matchId: 'm1' } },
          { points: 1, guess: { userId: 'other', matchId: 'm1' } },
        ]),
      },
      knockoutGuessScore: {
        findMany: jest.fn(async () => [
          { userId: 'requester', fixtureId: 'R32-73', points: 10 },
          { userId: 'target', fixtureId: 'R32-73', points: 2 },
        ]),
      },
      bracketPrediction: { findUnique: jest.fn(async () => null) },
    } as never;
  }

  it('reconstrói pontos acumulados e posição jogo a jogo, com as duas séries', async () => {
    const svc = new ProfileService(
      buildEvolutionPrisma(),
      buildCompetition(),
      buildRedis({ 'zscore:target': 7, 'bolao:exact:target': 0 }),
    );
    const res = await svc.getRankingEvolution('requester', 'target');

    expect(res.isSelf).toBe(false);
    expect(res.totalPlayers).toBe(3);
    expect(res.checkpoints.map((c) => c.label)).toEqual(['BRA×SRB', 'ARG×MEX']);
    // Jogo pendente (nº 2) é pulado; os checkpoints mantêm a numeração 1 e 3.
    expect(res.checkpoints.map((c) => c.gameNumber)).toEqual([1, 3]);

    // Acumulado: alvo 5 → 7; solicitante 3 → 13.
    expect(res.target.points).toEqual([5, 7]);
    expect(res.self?.points).toEqual([3, 13]);

    // Posições: após m1 alvo lidera (5 > 3 > 1) → 1º; solicitante 2º.
    // Após m2 solicitante salta para 13 → 1º; alvo cai para 2º.
    expect(res.target.position).toEqual([1, 2]);
    expect(res.self?.position).toEqual([2, 1]);
  });

  it('próprio perfil → apenas uma linha (self null)', async () => {
    const svc = new ProfileService(
      buildEvolutionPrisma(),
      buildCompetition(),
      buildRedis({ 'zscore:requester': 13 }),
    );
    const res = await svc.getRankingEvolution('requester', 'requester');
    expect(res.isSelf).toBe(true);
    expect(res.self).toBeNull();
    expect(res.target.points).toEqual([3, 13]);
  });
});
