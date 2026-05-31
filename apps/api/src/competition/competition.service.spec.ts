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

describe('CompetitionService.assertOpen (lock de palpites)', () => {
  const futureLock = new Date('2026-06-11T19:00:00Z');
  const pastLock = new Date('2020-01-01T00:00:00Z');
  const nowBeforeLock = new Date('2026-05-01T00:00:00Z');

  it('resolve quando aberta e antes do horário de lock', async () => {
    const svc = makeService({ locksAt: futureLock, closureStatus: 'open' }, nowBeforeLock);
    await expect(svc.assertOpen()).resolves.toBeUndefined();
  });

  it('REJEITA palpite enviado após o horário de lock', async () => {
    const svc = makeService({ locksAt: pastLock, closureStatus: 'open' }, nowBeforeLock);
    await expect(svc.assertOpen()).rejects.toBeInstanceOf(ForbiddenException);
  });

  it('rejeita quando a competição já foi encerrada (finalized)', async () => {
    const svc = makeService({ locksAt: futureLock, closureStatus: 'finalized' }, nowBeforeLock);
    await expect(svc.assertOpen()).rejects.toBeInstanceOf(ForbiddenException);
  });
});
