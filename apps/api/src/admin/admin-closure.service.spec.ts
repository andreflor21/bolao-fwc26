import { Test } from '@nestjs/testing';
import { BadRequestException, ConflictException, NotFoundException } from '@nestjs/common';
import { AdminClosureService } from './admin-closure.service';
import { PrismaService } from '../prisma/prisma.service';
import { RankingService } from '../ranking/ranking.service';
import { PrizeService } from '../prize/prize.service';
import { EmailService } from '../email/email.service';
import { REDIS_CLIENT } from '../redis/redis.tokens';
import { FIFA_WC_2026_ID, type PrizeCategory } from '@bolao/shared';

interface FakePayout {
  id: string;
  competitionId: string;
  userId: string | null;
  category: PrizeCategory;
  amountCents: number;
  percentage: number;
  paidAt: Date | null;
  paidByAdminId: string | null;
  paymentReference: string | null;
  createdAt: Date;
  user: { id: string; name: string; email: string; pixKey: string | null } | null;
}

describe('AdminClosureService', () => {
  let service: AdminClosureService;
  let state: {
    competitionStatus: 'open' | 'locked' | 'finalized';
    groupMatchTotal: number;
    groupMatchWithResult: number;
    knockoutMatchTotal: number;
    knockoutMatchWithResult: number;
    subscriptions: Array<{ userId: string; amountCents: number; userName: string }>;
    rankingRows: Array<{ userId: string; name: string; points: number }>;
    redisCounts: Record<string, string>;
    payouts: FakePayout[];
  };

  beforeEach(async () => {
    state = {
      competitionStatus: 'open',
      groupMatchTotal: 72,
      groupMatchWithResult: 72,
      knockoutMatchTotal: 32,
      knockoutMatchWithResult: 32,
      subscriptions: Array.from({ length: 10 }, (_, i) => ({
        userId: `u${i + 1}`,
        amountCents: 5000,
        userName: `User ${i + 1}`,
      })),
      rankingRows: Array.from({ length: 10 }, (_, i) => ({
        userId: `u${i + 1}`,
        name: `User ${i + 1}`,
        points: 100 - i * 5,
      })),
      redisCounts: { 'bolao:exact:u1': '12', 'bolao:exact:u2': '12', 'bolao:exact:u3': '8' },
      payouts: [],
    };

    const prismaMock = {
      competition: {
        findUnique: jest.fn(async () => ({
          id: FIFA_WC_2026_ID,
          closureStatus: state.competitionStatus,
          prizeDistribution: null,
        })),
        update: jest.fn(async ({ data }: { data: { closureStatus: 'finalized' } }) => {
          state.competitionStatus = data.closureStatus;
          return {};
        }),
      },
      match: {
        count: jest.fn(async (args: { where: { stage?: unknown; homeGoalsOfficial?: unknown } }) => {
          const isGroup = args.where.stage === 'group';
          const withResult = !!args.where.homeGoalsOfficial;
          if (isGroup) return withResult ? state.groupMatchWithResult : state.groupMatchTotal;
          return withResult ? state.knockoutMatchWithResult : state.knockoutMatchTotal;
        }),
        updateMany: jest.fn(async () => ({ count: 0 })),
      },
      subscription: {
        count: jest.fn(async () => state.subscriptions.length),
        findFirst: jest.fn(async () => state.subscriptions[0] ?? null),
        findMany: jest.fn(async () =>
          state.subscriptions.map((s) => ({
            userId: s.userId,
            user: { name: s.userName },
          })),
        ),
      },
      prizePayout: {
        findMany: jest.fn(async () => state.payouts),
        findUnique: jest.fn(async ({ where }: { where: { id: string } }) => {
          return state.payouts.find((p) => p.id === where.id) ?? null;
        }),
        update: jest.fn(async ({ where, data }: { where: { id: string }; data: Partial<FakePayout> }) => {
          const idx = state.payouts.findIndex((p) => p.id === where.id);
          if (idx === -1) throw new Error('not found');
          const updated = { ...state.payouts[idx]!, ...data };
          state.payouts[idx] = updated as FakePayout;
          return updated;
        }),
        deleteMany: jest.fn(async () => {
          const n = state.payouts.length;
          state.payouts = [];
          return { count: n };
        }),
        createMany: jest.fn(async ({ data }: { data: Array<Omit<FakePayout, 'id' | 'createdAt' | 'user' | 'paidAt' | 'paidByAdminId' | 'paymentReference'>> }) => {
          for (const d of data) {
            state.payouts.push({
              id: `pp_${state.payouts.length + 1}`,
              competitionId: d.competitionId,
              userId: d.userId,
              category: d.category,
              amountCents: d.amountCents,
              percentage: d.percentage,
              paidAt: null,
              paidByAdminId: null,
              paymentReference: null,
              createdAt: new Date('2026-07-19T12:00:00Z'),
              user: d.userId
                ? {
                    id: d.userId,
                    name: state.subscriptions.find((s) => s.userId === d.userId)?.userName ?? '?',
                    email: `${d.userId}@example.com`,
                    pixKey: null,
                  }
                : null,
            });
          }
          return { count: data.length };
        }),
      },
      $transaction: jest.fn(async (ops: Promise<unknown>[]) => Promise.all(ops)),
    };

    const rankingMock = {
      getGeneralRanking: jest.fn(async () => ({
        rows: state.rankingRows.map((r, idx) => ({
          ...r,
          rank: idx + 1,
        })),
      })),
    };

    const prizeMock = { invalidate: jest.fn(async () => undefined) };

    const emailMock = {
      sendPrizeAwarded: jest.fn(async () => undefined),
      sendPrizePaid: jest.fn(async () => undefined),
    };

    const redisMock = {
      mget: jest.fn(async (...keys: string[]) =>
        keys.map((k) => state.redisCounts[k] ?? null),
      ),
    };

    const moduleRef = await Test.createTestingModule({
      providers: [
        AdminClosureService,
        { provide: PrismaService, useValue: prismaMock },
        { provide: RankingService, useValue: rankingMock },
        { provide: PrizeService, useValue: prizeMock },
        { provide: EmailService, useValue: emailMock },
        { provide: REDIS_CLIENT, useValue: redisMock },
      ],
    }).compile();

    service = moduleRef.get(AdminClosureService);
  });

  describe('precheck', () => {
    it('reports both stages complete when fully scored', async () => {
      const pre = await service.precheck();
      expect(pre.groupComplete).toBe(true);
      expect(pre.knockoutComplete).toBe(true);
      expect(pre.totalSubscribers).toBe(10);
      expect(pre.poolTotalCents).toBe(50_000);
    });

    it('flags group incomplete', async () => {
      state.groupMatchWithResult = 70;
      const pre = await service.precheck();
      expect(pre.groupComplete).toBe(false);
      expect(pre.groupMatchesWithResult).toBe(70);
    });

    it('flags knockout incomplete independently from group', async () => {
      state.knockoutMatchWithResult = 30;
      const pre = await service.precheck();
      expect(pre.groupComplete).toBe(true);
      expect(pre.knockoutComplete).toBe(false);
    });
  });

  describe('finalize', () => {
    it('refuses to finalize when group stage incomplete', async () => {
      state.groupMatchWithResult = 70;
      await expect(service.finalize({})).rejects.toBeInstanceOf(BadRequestException);
    });

    it('refuses to finalize when KO incomplete without override', async () => {
      state.knockoutMatchWithResult = 30;
      await expect(service.finalize({})).rejects.toBeInstanceOf(BadRequestException);
    });

    it('finalises with KO incomplete when override is set', async () => {
      state.knockoutMatchWithResult = 30;
      const snap = await service.finalize({ confirmIncompleteKnockouts: true });
      expect(snap.closureStatus).toBe('finalized');
      expect(snap.payouts.length).toBeGreaterThan(0);
    });

    it('produces payouts that sum to pool total exactly', async () => {
      const snap = await service.finalize({});
      const sum = snap.payouts.reduce((a, p) => a + p.amountCents, 0);
      expect(sum).toBe(snap.poolTotalCents);
      expect(snap.totalDistributedCents).toBe(snap.poolTotalCents);
    });

    it('records the top-ranked user as the 1st-place payout', async () => {
      const snap = await service.finalize({});
      const first = snap.payouts.find((p) => p.category === 'first');
      expect(first?.user?.id).toBe('u1');
    });

    it('records exact-score king for the tied top exact counter', async () => {
      const snap = await service.finalize({});
      const king = snap.payouts.filter((p) => p.category === 'exact_score_king');
      // u1 and u2 are tied at 12 exact scores → split the prize.
      expect(king).toHaveLength(2);
      expect(king.map((k) => k.user?.id).sort()).toEqual(['u1', 'u2']);
      const total = king.reduce((a, p) => a + p.amountCents, 0);
      // 5% of 50_000c = 2_500c, split equally between 2 → 1250 each.
      expect(total).toBe(Math.floor(0.05 * 50_000));
    });

    it('records the admin slot with no user attached', async () => {
      const snap = await service.finalize({});
      const admin = snap.payouts.find((p) => p.category === 'admin');
      expect(admin?.user).toBeNull();
    });

    it('is idempotent: a 2nd call returns the existing snapshot without recreating', async () => {
      const first = await service.finalize({});
      const before = state.payouts.length;
      const second = await service.finalize({});
      expect(state.payouts.length).toBe(before);
      expect(second.totalDistributedCents).toBe(first.totalDistributedCents);
    });
  });

  describe('getSnapshot', () => {
    it('throws CONFLICT when competition not yet finalized', async () => {
      await expect(service.getSnapshot()).rejects.toBeInstanceOf(ConflictException);
    });

    it('returns the stored snapshot after finalisation', async () => {
      await service.finalize({});
      const snap = await service.getSnapshot();
      expect(snap.closureStatus).toBe('finalized');
      expect(snap.payouts.length).toBeGreaterThan(0);
    });
  });

  describe('payoutReportCsv', () => {
    it('refuses before finalisation', async () => {
      await expect(service.payoutReportCsv()).rejects.toBeInstanceOf(ConflictException);
    });

    it('returns CSV with header + 1 row per payout after finalisation', async () => {
      const snap = await service.finalize({});
      const csv = await service.payoutReportCsv();
      const lines = csv.trim().split('\n');
      expect(lines[0]).toBe('posicao,user_id,nome,email,categoria,valor_brl,paid_at,payment_reference');
      expect(lines.length).toBe(1 + snap.payouts.length);
      // First-place row should mention u1.
      const firstUserRow = lines.find((l) => l.includes(',u1,'));
      expect(firstUserRow).toBeDefined();
    });

    it('formats valor_brl with 2 decimals', async () => {
      await service.finalize({});
      const csv = await service.payoutReportCsv();
      // Match a row that looks like "...,225.00,..." (no thousands separator).
      expect(csv).toMatch(/,\d+\.\d{2},/);
    });
  });

  describe('markPaid', () => {
    it('refuses when payout does not exist', async () => {
      await expect(
        service.markPaid('00000000-0000-0000-0000-000000000000', 'admin-id', null),
      ).rejects.toBeInstanceOf(NotFoundException);
    });

    it('refuses to mark the admin slot as paid', async () => {
      await service.finalize({});
      const admin = state.payouts.find((p) => p.category === 'admin')!;
      await expect(service.markPaid(admin.id, 'a1', null)).rejects.toBeInstanceOf(
        BadRequestException,
      );
    });

    it('sets paid_at, paid_by_admin_id and payment_reference on first call', async () => {
      await service.finalize({});
      const first = state.payouts.find((p) => p.category === 'first')!;
      const updated = await service.markPaid(first.id, 'admin-99', 'pix-txid-1');
      expect(updated.paidAt).not.toBeNull();
      expect(updated.paidByAdminId).toBe('admin-99');
      expect(updated.paymentReference).toBe('pix-txid-1');
    });

    it('is idempotent: 2nd call keeps original paid_at and admin', async () => {
      await service.finalize({});
      const first = state.payouts.find((p) => p.category === 'first')!;
      const a = await service.markPaid(first.id, 'admin-99', 'ref-A');
      const originalPaidAt = a.paidAt;
      // Wait a tiny bit so a touch would change the timestamp if it happened.
      await new Promise((r) => setTimeout(r, 10));
      const b = await service.markPaid(first.id, 'admin-other', 'ref-A');
      expect(b.paidAt).toBe(originalPaidAt);
      expect(b.paidByAdminId).toBe('admin-99'); // not overwritten
    });

    it('updates payment_reference on re-call without touching paid_at', async () => {
      await service.finalize({});
      const first = state.payouts.find((p) => p.category === 'first')!;
      const a = await service.markPaid(first.id, 'admin-99', 'ref-A');
      const originalPaidAt = a.paidAt;
      const b = await service.markPaid(first.id, 'admin-99', 'ref-B');
      expect(b.paidAt).toBe(originalPaidAt);
      expect(b.paymentReference).toBe('ref-B');
    });
  });
});
