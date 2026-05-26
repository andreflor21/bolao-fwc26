import { Test } from '@nestjs/testing';
import { ReminderCron } from './reminder.cron';
import { PrismaService } from '../prisma/prisma.service';
import { PushService } from './push.service';
import { REDIS_CLIENT } from '../redis/redis.tokens';

describe('ReminderCron', () => {
  let cron: ReminderCron;
  let redisStore: Map<string, string>;
  let sendMock: jest.Mock;
  let candidates: Array<{ userId: string; user: { name: string } }>;

  beforeEach(async () => {
    redisStore = new Map();
    sendMock = jest.fn(async () => ({ delivered: 1, pruned: 0 }));
    candidates = [];

    const prismaMock = {
      subscription: {
        findMany: jest.fn(async () => candidates),
      },
    };
    const pushMock = { sendToUser: sendMock };
    const redisMock = {
      get: jest.fn(async (key: string) => redisStore.get(key) ?? null),
      set: jest.fn(async (key: string, value: string) => {
        redisStore.set(key, value);
        return 'OK';
      }),
    };

    const moduleRef = await Test.createTestingModule({
      providers: [
        ReminderCron,
        { provide: PrismaService, useValue: prismaMock },
        { provide: PushService, useValue: pushMock },
        { provide: REDIS_CLIENT, useValue: redisMock },
      ],
    }).compile();

    cron = moduleRef.get(ReminderCron);
  });

  it('sends a push to each candidate and marks dispatched', async () => {
    candidates = [
      { userId: 'u1', user: { name: 'Ana Silva' } },
      { userId: 'u2', user: { name: 'Bruno Costa' } },
    ];
    const out = await cron.runOnce();
    expect(out.alreadyDispatched).toBe(false);
    expect(out.candidates).toBe(2);
    expect(out.sent).toBe(2);
    expect(sendMock).toHaveBeenCalledTimes(2);
    expect(redisStore.has('bolao:reminder-d1:sent')).toBe(true);
  });

  it('is idempotent: 2nd run sees sentinel and skips', async () => {
    candidates = [{ userId: 'u1', user: { name: 'Ana' } }];
    await cron.runOnce();
    sendMock.mockClear();
    const out = await cron.runOnce();
    expect(out.alreadyDispatched).toBe(true);
    expect(sendMock).not.toHaveBeenCalled();
  });

  it('counts a candidate as skipped when push delivers 0 (no active subscription)', async () => {
    candidates = [{ userId: 'u1', user: { name: 'Ana' } }];
    sendMock.mockResolvedValueOnce({ delivered: 0, pruned: 0 });
    const out = await cron.runOnce();
    expect(out.sent).toBe(0);
    expect(out.skipped).toBe(1);
  });

  it('no-ops when no candidates and still marks dispatched', async () => {
    candidates = [];
    const out = await cron.runOnce();
    expect(out.candidates).toBe(0);
    expect(out.sent).toBe(0);
    expect(redisStore.has('bolao:reminder-d1:sent')).toBe(true);
  });
});
