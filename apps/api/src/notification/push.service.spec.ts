import { Test } from '@nestjs/testing';
import { ConfigService } from '@nestjs/config';
import webpush from 'web-push';
import { PushService } from './push.service';
import { PrismaService } from '../prisma/prisma.service';

// Mock the web-push module — we don't want real HTTP calls in tests.
jest.mock('web-push', () => ({
  __esModule: true,
  default: {
    setVapidDetails: jest.fn(),
    sendNotification: jest.fn(),
  },
}));

const sendNotification = webpush.sendNotification as unknown as jest.Mock;

interface FakeSub {
  id: string;
  userId: string;
  endpoint: string;
  keysP256dh: string;
  keysAuth: string;
  userAgent: string | null;
  createdAt: Date;
}

describe('PushService', () => {
  let service: PushService;
  let subs: FakeSub[];
  let nextId: number;

  beforeEach(async () => {
    subs = [];
    nextId = 1;
    sendNotification.mockReset();

    const prismaMock = {
      pushSubscription: {
        findUnique: jest.fn(async ({ where }: { where: { userId_endpoint: { userId: string; endpoint: string } } }) => {
          return (
            subs.find(
              (s) =>
                s.userId === where.userId_endpoint.userId &&
                s.endpoint === where.userId_endpoint.endpoint,
            ) ?? null
          );
        }),
        findMany: jest.fn(async ({ where }: { where: { userId: string } }) => {
          return subs.filter((s) => s.userId === where.userId);
        }),
        create: jest.fn(async ({ data }: { data: Omit<FakeSub, 'id' | 'createdAt'> }) => {
          const row: FakeSub = {
            id: `sub_${nextId++}`,
            createdAt: new Date(),
            ...data,
            userAgent: data.userAgent ?? null,
          };
          subs.push(row);
          return { id: row.id };
        }),
        update: jest.fn(async ({ where, data }: { where: { id: string }; data: Partial<FakeSub> }) => {
          const idx = subs.findIndex((s) => s.id === where.id);
          if (idx === -1) throw new Error('not found');
          subs[idx] = { ...subs[idx]!, ...data } as FakeSub;
          return subs[idx];
        }),
        deleteMany: jest.fn(async ({ where }: { where: { id?: { in: string[] }; userId?: string; endpoint?: string } }) => {
          const before = subs.length;
          if (where.id) {
            subs = subs.filter((s) => !where.id!.in.includes(s.id));
          } else if (where.userId && where.endpoint) {
            subs = subs.filter((s) => !(s.userId === where.userId && s.endpoint === where.endpoint));
          }
          return { count: before - subs.length };
        }),
      },
    };

    const configMock = {
      get: (k: string) =>
        ({
          VAPID_PUBLIC_KEY: 'BPubKeyForTesting',
          VAPID_PRIVATE_KEY: 'PrivKeyForTesting',
          VAPID_SUBJECT: 'mailto:test@example.com',
        })[k],
    };

    const moduleRef = await Test.createTestingModule({
      providers: [
        PushService,
        { provide: PrismaService, useValue: prismaMock },
        { provide: ConfigService, useValue: configMock },
      ],
    }).compile();
    service = moduleRef.get(PushService);
  });

  describe('subscribe', () => {
    it('creates a new subscription on first call', async () => {
      const out = await service.subscribe(
        'u1',
        {
          endpoint: 'https://push.example/abc',
          keys: { p256dh: 'KEY1', auth: 'AUTH1' },
        },
        'Mozilla/5.0',
      );
      expect(out.alreadySubscribed).toBe(false);
      expect(subs).toHaveLength(1);
      expect(subs[0]!.userAgent).toBe('Mozilla/5.0');
    });

    it('upserts on (userId, endpoint) — second call updates keys, no duplicate row', async () => {
      await service.subscribe(
        'u1',
        { endpoint: 'https://push.example/abc', keys: { p256dh: 'KEY1', auth: 'AUTH1' } },
        null,
      );
      const out = await service.subscribe(
        'u1',
        { endpoint: 'https://push.example/abc', keys: { p256dh: 'KEY2', auth: 'AUTH2' } },
        null,
      );
      expect(out.alreadySubscribed).toBe(true);
      expect(subs).toHaveLength(1);
      expect(subs[0]!.keysP256dh).toBe('KEY2');
    });
  });

  describe('unsubscribe', () => {
    it('removes the matching sub and reports removed:true', async () => {
      await service.subscribe(
        'u1',
        { endpoint: 'https://push.example/abc', keys: { p256dh: 'K', auth: 'A' } },
        null,
      );
      const out = await service.unsubscribe('u1', 'https://push.example/abc');
      expect(out.removed).toBe(true);
      expect(subs).toHaveLength(0);
    });

    it('reports removed:false when nothing matched', async () => {
      const out = await service.unsubscribe('u1', 'https://push.example/missing');
      expect(out.removed).toBe(false);
    });
  });

  describe('sendToUser', () => {
    beforeEach(async () => {
      await service.subscribe(
        'u1',
        { endpoint: 'https://push.example/a', keys: { p256dh: 'p', auth: 'a' } },
        null,
      );
      await service.subscribe(
        'u1',
        { endpoint: 'https://push.example/b', keys: { p256dh: 'p', auth: 'a' } },
        null,
      );
    });

    it('delivers to every active subscription', async () => {
      sendNotification.mockResolvedValue({});
      const out = await service.sendToUser('u1', { title: 't', body: 'b' });
      expect(out.delivered).toBe(2);
      expect(out.pruned).toBe(0);
      expect(sendNotification).toHaveBeenCalledTimes(2);
    });

    it('prunes subscriptions returning 410 (gone)', async () => {
      sendNotification
        .mockResolvedValueOnce({})
        .mockRejectedValueOnce(Object.assign(new Error('gone'), { statusCode: 410 }));
      const out = await service.sendToUser('u1', { title: 't', body: 'b' });
      expect(out.delivered).toBe(1);
      expect(out.pruned).toBe(1);
      expect(subs).toHaveLength(1);
    });

    it('prunes 404 endpoints and keeps non-404 errors as transient', async () => {
      sendNotification
        .mockRejectedValueOnce(Object.assign(new Error('not found'), { statusCode: 404 }))
        .mockRejectedValueOnce(Object.assign(new Error('rate limit'), { statusCode: 429 }));
      const out = await service.sendToUser('u1', { title: 't', body: 'b' });
      expect(out.delivered).toBe(0);
      // 1 was 404 → pruned. 1 was 429 → left alone (transient).
      expect(out.pruned).toBe(1);
      expect(subs).toHaveLength(1);
    });

    it('no-ops when the user has no subscriptions', async () => {
      const out = await service.sendToUser('u-ghost', { title: 't', body: 'b' });
      expect(out.delivered).toBe(0);
      expect(out.pruned).toBe(0);
      expect(sendNotification).not.toHaveBeenCalled();
    });
  });
});
