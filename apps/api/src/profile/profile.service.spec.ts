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
    const svc = new ProfileService(prisma, redis);

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

  it('próprio dono: vê todos os palpites independente do lock', async () => {
    const prisma = buildPrisma({
      matches,
      guesses,
      targetUser: { id: 'requester', name: 'Eu' },
      requesterSub: { status: 'active' },
      targetSub: { status: 'active' },
    });
    const redis = buildRedis();
    const svc = new ProfileService(prisma, redis);
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
    const svc = new ProfileService(prisma, buildRedis());
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
    const svc = new ProfileService(prisma, buildRedis());
    await expect(svc.getGroupGuesses('requester', 'target')).rejects.toThrow(NotFoundException);
  });
});
