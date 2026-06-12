import { BadRequestException, ConflictException, ForbiddenException } from '@nestjs/common';

// nanoid v4+ é ESM-only e quebra o transform do Jest — mock simples basta aqui.
jest.mock('nanoid', () => ({ nanoid: () => 'test-token' }));

import { SidePoolService } from './side-pool.service';

/**
 * Mock mínimo do Prisma para exercitar as regras dos convites. Cada teste
 * monta só o que precisa; chamadas não configuradas devolvem null/[].
 */
function buildPrisma(overrides: Record<string, unknown> = {}) {
  const base = {
    sidePool: { findUnique: jest.fn(async () => null) },
    sidePoolMember: {
      findUnique: jest.fn(async () => null),
      findMany: jest.fn(async () => []),
      create: jest.fn(async () => ({})),
    },
    sidePoolInvite: {
      findUnique: jest.fn(async () => null),
      findMany: jest.fn(async () => []),
      upsert: jest.fn(async () => ({ id: 'invite-1' })),
      delete: jest.fn(async () => ({})),
    },
    subscription: { findUnique: jest.fn(async () => ({ status: 'active' })) },
    $transaction: jest.fn(async (ops: unknown[]) => ops),
  };
  return { ...base, ...overrides } as never;
}

const POOL = { id: 'pool-1', maxMembers: 10, _count: { members: 3 } };

describe('SidePoolService — convites', () => {
  it('rejeita convidar a si mesmo', async () => {
    const svc = new SidePoolService(buildPrisma());
    await expect(svc.invite('me', 'pool-1', 'me')).rejects.toThrow(BadRequestException);
  });

  it('rejeita quando o convidador não é membro do bolão', async () => {
    const prisma = buildPrisma({
      sidePool: { findUnique: jest.fn(async () => POOL) },
      sidePoolMember: {
        findUnique: jest.fn(async () => null), // não é membro
        findMany: jest.fn(async () => []),
        create: jest.fn(),
      },
    });
    const svc = new SidePoolService(prisma);
    await expect(svc.invite('me', 'pool-1', 'target')).rejects.toThrow(ForbiddenException);
  });

  it('rejeita convidar quem não tem assinatura ativa', async () => {
    const prisma = buildPrisma({
      sidePool: { findUnique: jest.fn(async () => POOL) },
      sidePoolMember: {
        findUnique: jest.fn(async ({ where }: { where: { sidePoolId_userId: { userId: string } } }) =>
          where.sidePoolId_userId.userId === 'me' ? { id: 'mem' } : null,
        ),
        findMany: jest.fn(async () => []),
        create: jest.fn(),
      },
      subscription: { findUnique: jest.fn(async () => ({ status: 'pending_payment' })) },
    });
    const svc = new SidePoolService(prisma);
    await expect(svc.invite('me', 'pool-1', 'target')).rejects.toThrow(BadRequestException);
  });

  it('rejeita convidar quem já é membro', async () => {
    const prisma = buildPrisma({
      sidePool: { findUnique: jest.fn(async () => POOL) },
      sidePoolMember: {
        findUnique: jest.fn(async () => ({ id: 'mem' })), // ambos "membros"
        findMany: jest.fn(async () => []),
        create: jest.fn(),
      },
    });
    const svc = new SidePoolService(prisma);
    await expect(svc.invite('me', 'pool-1', 'target')).rejects.toThrow(ConflictException);
  });

  it('convida com sucesso (qualquer membro pode) e faz upsert do convite', async () => {
    const upsert = jest.fn(async () => ({ id: 'invite-9' }));
    const prisma = buildPrisma({
      sidePool: { findUnique: jest.fn(async () => POOL) },
      sidePoolMember: {
        findUnique: jest.fn(async ({ where }: { where: { sidePoolId_userId: { userId: string } } }) =>
          where.sidePoolId_userId.userId === 'me' ? { id: 'mem' } : null,
        ),
        findMany: jest.fn(async () => []),
        create: jest.fn(),
      },
      sidePoolInvite: {
        findUnique: jest.fn(async () => null),
        findMany: jest.fn(async () => []),
        upsert,
        delete: jest.fn(),
      },
    });
    const svc = new SidePoolService(prisma);
    const res = await svc.invite('me', 'pool-1', 'target');
    expect(res).toEqual({ inviteId: 'invite-9' });
    expect(upsert).toHaveBeenCalledTimes(1);
  });

  it('listInvitable mapeia member / invited / invitable', async () => {
    const prisma = buildPrisma({
      sidePoolMember: {
        findUnique: jest.fn(),
        create: jest.fn(),
        findMany: jest.fn(
          async ({ where }: { where: { userId: string } }) => {
            if (where.userId === 'viewer') {
              return [
                { sidePoolId: 'p-member', sidePool: { id: 'p-member', name: 'A', maxMembers: 10, _count: { members: 2 } } },
                { sidePoolId: 'p-invited', sidePool: { id: 'p-invited', name: 'B', maxMembers: 10, _count: { members: 2 } } },
                { sidePoolId: 'p-open', sidePool: { id: 'p-open', name: 'C', maxMembers: 10, _count: { members: 2 } } },
              ];
            }
            // target memberships
            return [{ sidePoolId: 'p-member' }];
          },
        ),
      },
      sidePoolInvite: {
        findUnique: jest.fn(),
        delete: jest.fn(),
        upsert: jest.fn(),
        findMany: jest.fn(async () => [{ id: 'inv-1', sidePoolId: 'p-invited' }]),
      },
    });
    const svc = new SidePoolService(prisma);
    const res = await svc.listInvitable('viewer', 'target');
    const byId = new Map(res.map((r) => [r.sidePoolId, r]));
    expect(byId.get('p-member')?.state).toBe('member');
    expect(byId.get('p-invited')?.state).toBe('invited');
    expect(byId.get('p-invited')?.inviteId).toBe('inv-1');
    expect(byId.get('p-open')?.state).toBe('invitable');
  });

  it('listInvitable vazio quando viewer === target', async () => {
    const svc = new SidePoolService(buildPrisma());
    expect(await svc.listInvitable('me', 'me')).toEqual([]);
  });
});
