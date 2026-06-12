import { ForbiddenException } from '@nestjs/common';
import { CompetitionService } from './competition.service';

function makeService(
  competition: { locksAt: Date; closureStatus: string },
  now: Date,
): CompetitionService {
  const prisma = {
    $queryRaw: jest.fn(async () => [{ now }]),
    competition: { findUnique: jest.fn(async () => competition) },
  };
  const config = { get: () => undefined };
  return new CompetitionService(prisma as never, config as never);
}

describe('CompetitionService — trava geral (1h antes do 1º jogo)', () => {
  // locksAt = apito do 1º jogo; trava efetiva = locksAt - 1h = 18:00Z.
  const firstKickoff = new Date('2026-06-11T19:00:00Z');

  it('resolve quando aberta e antes da trava (1h antes do apito)', async () => {
    const now = new Date('2026-06-11T17:30:00Z'); // 1h30 antes do apito → ainda aberto
    const svc = makeService({ locksAt: firstKickoff, closureStatus: 'open' }, now);
    await expect(svc.assertOpen()).resolves.toBeUndefined();
    await expect(svc.assertKnockoutOpen()).resolves.toBeUndefined();
  });

  it('REJEITA no intervalo de 1h antes do apito (já travado)', async () => {
    const now = new Date('2026-06-11T18:30:00Z'); // 30min antes do apito → já travado
    const svc = makeService({ locksAt: firstKickoff, closureStatus: 'open' }, now);
    await expect(svc.assertOpen()).rejects.toBeInstanceOf(ForbiddenException);
    await expect(svc.assertKnockoutOpen()).rejects.toBeInstanceOf(ForbiddenException);
  });

  it('grupos e mata-mata usam a MESMA trava (getLockAt = locksAt - 1h)', async () => {
    const svc = makeService({ locksAt: firstKickoff, closureStatus: 'open' }, firstKickoff);
    const lock = await svc.getLockAt();
    const koLock = await svc.getKnockoutLockAt();
    expect(lock.toISOString()).toBe('2026-06-11T18:00:00.000Z');
    expect(koLock.toISOString()).toBe(lock.toISOString());
  });

  it('rejeita quando a competição já foi encerrada (finalized)', async () => {
    const now = new Date('2026-05-01T00:00:00Z');
    const svc = makeService({ locksAt: firstKickoff, closureStatus: 'finalized' }, now);
    await expect(svc.assertOpen()).rejects.toBeInstanceOf(ForbiddenException);
    await expect(svc.assertKnockoutOpen()).rejects.toBeInstanceOf(ForbiddenException);
  });

  describe('isLocked() — versão booleana usada para revelar palpites', () => {
    it('travada quando encerrada cedo, mesmo com horário no futuro', async () => {
      const svc = makeService(
        { locksAt: new Date('2099-01-01T00:00:00Z'), closureStatus: 'finalized' },
        new Date(),
      );
      await expect(svc.isLocked()).resolves.toBe(true);
    });

    it('aberta quando ainda "open" e o horário da trava está no futuro', async () => {
      const svc = makeService(
        { locksAt: new Date('2099-01-01T00:00:00Z'), closureStatus: 'open' },
        new Date(),
      );
      await expect(svc.isLocked()).resolves.toBe(false);
    });

    it('travada quando "open" mas o horário da trava já passou', async () => {
      const svc = makeService(
        { locksAt: new Date('2020-01-01T00:00:00Z'), closureStatus: 'open' },
        new Date(),
      );
      await expect(svc.isLocked()).resolves.toBe(true);
    });
  });
});
