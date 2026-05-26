import { Test } from '@nestjs/testing';
import { ConfigService } from '@nestjs/config';
import { ConflictException, ForbiddenException } from '@nestjs/common';
import { PaymentService } from './payment.service';
import { PrismaService } from '../prisma/prisma.service';
import { EmailService } from '../email/email.service';
import { CompetitionService } from '../competition/competition.service';
import { PAYMENT_DRIVER } from './payment.tokens';
import { MockPaymentDriver } from './drivers/mock-payment.driver';
import type { WebhookEvent } from './drivers/payment-driver.interface';

interface FakeSubscription {
  id: string;
  userId: string;
  competitionId: string;
  status: 'pending_payment' | 'active' | 'refunded';
  amountCents: number;
  stripePaymentIntentId: string | null;
  paidAt: Date | null;
  refundedAt: Date | null;
  user?: { email: string; name: string };
}

describe('PaymentService', () => {
  let service: PaymentService;
  let prisma: {
    subscription: {
      findUnique: jest.Mock;
      create: jest.Mock;
      update: jest.Mock;
    };
    user: { update: jest.Mock };
    processedWebhookEvent: { create: jest.Mock };
    $transaction: jest.Mock;
  };
  let email: { sendPaymentConfirmed: jest.Mock };
  let competition: { assertOpen: jest.Mock; getMain: jest.Mock };
  let driver: MockPaymentDriver;
  let subState: Map<string, FakeSubscription>;

  beforeEach(async () => {
    subState = new Map();
    prisma = {
      subscription: {
        findUnique: jest.fn(async ({ where }: { where: { userId_competitionId?: { userId: string }; stripePaymentIntentId?: string } }) => {
          if (where.userId_competitionId) {
            return [...subState.values()].find((s) => s.userId === where.userId_competitionId!.userId) ?? null;
          }
          if (where.stripePaymentIntentId) {
            return [...subState.values()].find((s) => s.stripePaymentIntentId === where.stripePaymentIntentId) ?? null;
          }
          return null;
        }),
        create: jest.fn(async ({ data }: { data: Partial<FakeSubscription> }) => {
          const sub: FakeSubscription = {
            id: `sub_${Math.random().toString(36).slice(2, 8)}`,
            userId: data.userId!,
            competitionId: data.competitionId!,
            status: (data.status ?? 'pending_payment') as FakeSubscription['status'],
            amountCents: data.amountCents ?? 5000,
            stripePaymentIntentId: null,
            paidAt: null,
            refundedAt: null,
          };
          subState.set(sub.id, sub);
          return sub;
        }),
        update: jest.fn(async ({ where, data }: { where: { id: string }; data: Partial<FakeSubscription> }) => {
          const sub = subState.get(where.id)!;
          const updated = { ...sub, ...data };
          subState.set(where.id, updated);
          return updated;
        }),
      },
      user: { update: jest.fn(async () => ({})) },
      processedWebhookEvent: {
        create: jest.fn(async () => ({ id: 'evt' })),
      },
      $transaction: jest.fn(async (ops: Promise<unknown>[]) => Promise.all(ops)),
    };
    email = { sendPaymentConfirmed: jest.fn(async () => undefined) };
    competition = {
      assertOpen: jest.fn(async () => undefined),
      getMain: jest.fn(async () => ({
        id: 'fifa-wc-2026',
        locksAt: new Date(Date.now() + 30 * 24 * 3600 * 1000),
      })),
    };
    driver = new MockPaymentDriver();

    const module = await Test.createTestingModule({
      providers: [
        PaymentService,
        { provide: PrismaService, useValue: prisma },
        { provide: EmailService, useValue: email },
        { provide: CompetitionService, useValue: competition },
        { provide: PAYMENT_DRIVER, useValue: driver },
        { provide: ConfigService, useValue: { get: (k: string) => (k === 'SUBSCRIPTION_AMOUNT_CENTS' ? 5000 : undefined) } },
      ],
    }).compile();

    service = module.get(PaymentService);
  });

  describe('createOrGetPaymentIntent', () => {
    it('creates a subscription row and a fresh PI on first call', async () => {
      const out = await service.createOrGetPaymentIntent('user-1');
      expect(out.paymentIntentId).toMatch(/^mock_pi_/);
      expect(out.amountCents).toBe(5000);
      expect(out.subscriptionStatus).toBe('pending_payment');
      expect(prisma.subscription.create).toHaveBeenCalledTimes(1);
      const sub = [...subState.values()][0]!;
      expect(sub.stripePaymentIntentId).toBe(out.paymentIntentId);
    });

    it('rejects when subscription is already active', async () => {
      subState.set('sub1', {
        id: 'sub1',
        userId: 'user-1',
        competitionId: 'fifa-wc-2026',
        status: 'active',
        amountCents: 5000,
        stripePaymentIntentId: 'mock_pi_old',
        paidAt: new Date(),
        refundedAt: null,
      });
      await expect(service.createOrGetPaymentIntent('user-1')).rejects.toBeInstanceOf(ConflictException);
    });

    it('rejects when subscription has been refunded', async () => {
      subState.set('sub1', {
        id: 'sub1',
        userId: 'user-1',
        competitionId: 'fifa-wc-2026',
        status: 'refunded',
        amountCents: 5000,
        stripePaymentIntentId: 'mock_pi_old',
        paidAt: new Date(),
        refundedAt: new Date(),
      });
      await expect(service.createOrGetPaymentIntent('user-1')).rejects.toBeInstanceOf(ConflictException);
    });

    it('rejects when competition is locked', async () => {
      competition.assertOpen.mockRejectedValueOnce(new ForbiddenException('LOCKED_COMPETITION'));
      await expect(service.createOrGetPaymentIntent('user-1')).rejects.toBeInstanceOf(ForbiddenException);
    });
  });

  describe('activateFromPaymentIntent (idempotent)', () => {
    it('activates a pending subscription and promotes role', async () => {
      const pi = await driver.createPixPaymentIntent({ userId: 'user-1', amountCents: 5000 });
      subState.set('sub1', {
        id: 'sub1',
        userId: 'user-1',
        competitionId: 'fifa-wc-2026',
        status: 'pending_payment',
        amountCents: 5000,
        stripePaymentIntentId: pi.paymentIntentId,
        paidAt: null,
        refundedAt: null,
        user: { email: 'a@b.com', name: 'Ana' },
      });
      const result = await service.activateFromPaymentIntent(pi.paymentIntentId);
      expect(result.activated).toBe(true);
      expect(subState.get('sub1')!.status).toBe('active');
      expect(prisma.user.update).toHaveBeenCalledWith(
        expect.objectContaining({ data: { role: 'subscriber' } }),
      );
      expect(email.sendPaymentConfirmed).toHaveBeenCalledWith('a@b.com', 'Ana');
    });

    it('no-ops when already active', async () => {
      subState.set('sub1', {
        id: 'sub1',
        userId: 'user-1',
        competitionId: 'fifa-wc-2026',
        status: 'active',
        amountCents: 5000,
        stripePaymentIntentId: 'mock_pi_x',
        paidAt: new Date(),
        refundedAt: null,
        user: { email: 'a@b.com', name: 'Ana' },
      });
      const result = await service.activateFromPaymentIntent('mock_pi_x');
      expect(result.activated).toBe(false);
      expect(result.reason).toBe('already_active');
      expect(email.sendPaymentConfirmed).not.toHaveBeenCalled();
    });

    it('refuses to re-activate refunded subscriptions', async () => {
      subState.set('sub1', {
        id: 'sub1',
        userId: 'user-1',
        competitionId: 'fifa-wc-2026',
        status: 'refunded',
        amountCents: 5000,
        stripePaymentIntentId: 'mock_pi_x',
        paidAt: new Date(),
        refundedAt: new Date(),
        user: { email: 'a@b.com', name: 'Ana' },
      });
      const result = await service.activateFromPaymentIntent('mock_pi_x');
      expect(result.activated).toBe(false);
      expect(result.reason).toBe('refunded');
    });

    it('returns subscription_not_found for unknown PI', async () => {
      const result = await service.activateFromPaymentIntent('mock_pi_ghost');
      expect(result.activated).toBe(false);
      expect(result.reason).toBe('subscription_not_found');
    });
  });

  describe('handleWebhookEvent', () => {
    function buildEvent(type: string, piId = 'mock_pi_x'): WebhookEvent {
      return {
        id: `evt_${Math.random().toString(36).slice(2, 8)}`,
        type,
        paymentIntent: {
          id: piId,
          status: 'succeeded',
          amountCents: 5000,
          metadata: {},
          createdAt: new Date().toISOString(),
          succeededAt: new Date().toISOString(),
          canceledAt: null,
        },
      };
    }

    it('skips duplicate events via processed_webhook_events PK conflict', async () => {
      const event = buildEvent('payment_intent.succeeded');
      subState.set('sub1', {
        id: 'sub1',
        userId: 'user-1',
        competitionId: 'fifa-wc-2026',
        status: 'pending_payment',
        amountCents: 5000,
        stripePaymentIntentId: event.paymentIntent!.id,
        paidAt: null,
        refundedAt: null,
        user: { email: 'a@b.com', name: 'Ana' },
      });

      const first = await service.handleWebhookEvent(event);
      expect(first.handled).toBe(true);

      // Simulate PK conflict on second insertion.
      prisma.processedWebhookEvent.create.mockRejectedValueOnce(new Error('duplicate key'));
      const second = await service.handleWebhookEvent(event);
      expect(second.handled).toBe(false);
      expect(second.reason).toBe('duplicate_event');
      // sendPaymentConfirmed only called once (from first handling).
      expect(email.sendPaymentConfirmed).toHaveBeenCalledTimes(1);
    });

    it('ignores unsupported event types', async () => {
      const event: WebhookEvent = { id: 'evt', type: 'charge.refunded', paymentIntent: null };
      const result = await service.handleWebhookEvent(event);
      expect(result.handled).toBe(false);
      expect(result.reason).toBe('unsupported_type');
    });

    it('handles payment_intent.canceled by no-op when subscription is pending', async () => {
      subState.set('sub1', {
        id: 'sub1',
        userId: 'user-1',
        competitionId: 'fifa-wc-2026',
        status: 'pending_payment',
        amountCents: 5000,
        stripePaymentIntentId: 'mock_pi_x',
        paidAt: null,
        refundedAt: null,
      });
      const event = buildEvent('payment_intent.canceled');
      const result = await service.handleWebhookEvent(event);
      expect(result.handled).toBe(true);
      // Subscription stays pending — admin/UX decides whether to retry.
      expect(subState.get('sub1')!.status).toBe('pending_payment');
    });
  });

  describe('refund window', () => {
    it('refunds when paid <7d ago AND competition still open', async () => {
      const pi = await driver.createPixPaymentIntent({ userId: 'user-1', amountCents: 5000 });
      driver.forceSucceed(pi.paymentIntentId);
      subState.set('sub1', {
        id: 'sub1',
        userId: 'user-1',
        competitionId: 'fifa-wc-2026',
        status: 'active',
        amountCents: 5000,
        stripePaymentIntentId: pi.paymentIntentId,
        paidAt: new Date(),
        refundedAt: null,
      });
      const out = await service.refund('user-1');
      expect(out.refunded).toBe(true);
      expect(subState.get('sub1')!.status).toBe('refunded');
      expect(prisma.user.update).toHaveBeenCalledWith(
        expect.objectContaining({ data: { role: 'player' } }),
      );
    });

    it('rejects when paid >7d ago', async () => {
      const pi = await driver.createPixPaymentIntent({ userId: 'user-1', amountCents: 5000 });
      driver.forceSucceed(pi.paymentIntentId);
      const eightDaysAgo = new Date(Date.now() - 8 * 24 * 3600 * 1000);
      subState.set('sub1', {
        id: 'sub1',
        userId: 'user-1',
        competitionId: 'fifa-wc-2026',
        status: 'active',
        amountCents: 5000,
        stripePaymentIntentId: pi.paymentIntentId,
        paidAt: eightDaysAgo,
        refundedAt: null,
      });
      await expect(service.refund('user-1')).rejects.toBeInstanceOf(ForbiddenException);
    });

    it('rejects when competition is locked', async () => {
      const pi = await driver.createPixPaymentIntent({ userId: 'user-1', amountCents: 5000 });
      driver.forceSucceed(pi.paymentIntentId);
      competition.getMain.mockResolvedValueOnce({
        id: 'fifa-wc-2026',
        locksAt: new Date(Date.now() - 1_000),
      });
      subState.set('sub1', {
        id: 'sub1',
        userId: 'user-1',
        competitionId: 'fifa-wc-2026',
        status: 'active',
        amountCents: 5000,
        stripePaymentIntentId: pi.paymentIntentId,
        paidAt: new Date(),
        refundedAt: null,
      });
      await expect(service.refund('user-1')).rejects.toBeInstanceOf(ForbiddenException);
    });
  });
});
