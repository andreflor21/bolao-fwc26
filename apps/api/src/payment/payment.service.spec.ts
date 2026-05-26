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
  stripeCheckoutSessionId: string | null;
  checkoutSessionExpiresAt: Date | null;
  paidAt: Date | null;
  refundedAt: Date | null;
  user?: { email: string; name: string };
}

const CONFIG: Record<string, string | number | undefined> = {
  SUBSCRIPTION_AMOUNT_CENTS: 5000,
  STRIPE_CHECKOUT_METHODS: 'card,link,boleto',
  STRIPE_BOLETO_EXPIRES_AFTER_DAYS: 3,
  WEB_ORIGIN: 'http://localhost:5173',
};

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
        findUnique: jest.fn(
          async ({
            where,
          }: {
            where: {
              userId_competitionId?: { userId: string };
              stripePaymentIntentId?: string;
              stripeCheckoutSessionId?: string;
            };
          }) => {
            if (where.userId_competitionId) {
              return (
                [...subState.values()].find(
                  (s) => s.userId === where.userId_competitionId!.userId,
                ) ?? null
              );
            }
            if (where.stripePaymentIntentId) {
              return (
                [...subState.values()].find(
                  (s) => s.stripePaymentIntentId === where.stripePaymentIntentId,
                ) ?? null
              );
            }
            if (where.stripeCheckoutSessionId) {
              return (
                [...subState.values()].find(
                  (s) => s.stripeCheckoutSessionId === where.stripeCheckoutSessionId,
                ) ?? null
              );
            }
            return null;
          },
        ),
        create: jest.fn(async ({ data }: { data: Partial<FakeSubscription> }) => {
          const sub: FakeSubscription = {
            id: `sub_${Math.random().toString(36).slice(2, 8)}`,
            userId: data.userId!,
            competitionId: data.competitionId!,
            status: (data.status ?? 'pending_payment') as FakeSubscription['status'],
            amountCents: data.amountCents ?? 5000,
            stripePaymentIntentId: null,
            stripeCheckoutSessionId: null,
            checkoutSessionExpiresAt: null,
            paidAt: null,
            refundedAt: null,
          };
          subState.set(sub.id, sub);
          return sub;
        }),
        update: jest.fn(
          async ({
            where,
            data,
          }: {
            where: { id: string };
            data: Partial<FakeSubscription>;
          }) => {
            const sub = subState.get(where.id)!;
            const updated = { ...sub, ...data };
            subState.set(where.id, updated);
            return updated;
          },
        ),
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
        { provide: ConfigService, useValue: { get: (k: string) => CONFIG[k] } },
      ],
    }).compile();

    service = module.get(PaymentService);
  });

  describe('createOrGetCheckoutSession', () => {
    it('creates a subscription + checkout session on first call', async () => {
      const out = await service.createOrGetCheckoutSession('user-1');
      expect(out.sessionId).toMatch(/^mock_cs_/);
      expect(out.checkoutUrl).toContain('/pay/mock-success?sid=');
      expect(out.amountCents).toBe(5000);
      expect(out.subscriptionStatus).toBe('pending_payment');
      expect(out.methods).toEqual(['card', 'link', 'boleto']);
      const sub = [...subState.values()][0]!;
      expect(sub.stripeCheckoutSessionId).toBe(out.sessionId);
      expect(sub.stripePaymentIntentId).toMatch(/^mock_pi_/);
    });

    it('reuses an unexpired open session on a second call', async () => {
      const first = await service.createOrGetCheckoutSession('user-1');
      const second = await service.createOrGetCheckoutSession('user-1');
      expect(second.sessionId).toBe(first.sessionId);
    });

    it('rejects when subscription is already active', async () => {
      subState.set('sub1', {
        id: 'sub1',
        userId: 'user-1',
        competitionId: 'fifa-wc-2026',
        status: 'active',
        amountCents: 5000,
        stripePaymentIntentId: 'mock_pi_old',
        stripeCheckoutSessionId: 'mock_cs_old',
        checkoutSessionExpiresAt: null,
        paidAt: new Date(),
        refundedAt: null,
      });
      await expect(service.createOrGetCheckoutSession('user-1')).rejects.toBeInstanceOf(
        ConflictException,
      );
    });

    it('rejects when subscription has been refunded', async () => {
      subState.set('sub1', {
        id: 'sub1',
        userId: 'user-1',
        competitionId: 'fifa-wc-2026',
        status: 'refunded',
        amountCents: 5000,
        stripePaymentIntentId: 'mock_pi_old',
        stripeCheckoutSessionId: null,
        checkoutSessionExpiresAt: null,
        paidAt: new Date(),
        refundedAt: new Date(),
      });
      await expect(service.createOrGetCheckoutSession('user-1')).rejects.toBeInstanceOf(
        ConflictException,
      );
    });

    it('rejects when competition is locked', async () => {
      competition.assertOpen.mockRejectedValueOnce(new ForbiddenException('LOCKED_COMPETITION'));
      await expect(service.createOrGetCheckoutSession('user-1')).rejects.toBeInstanceOf(
        ForbiddenException,
      );
    });
  });

  describe('activateFromPaymentIntent (idempotent)', () => {
    it('activates a pending subscription and promotes role', async () => {
      const session = await driver.createCheckoutSession({
        userId: 'user-1',
        amountCents: 5000,
        description: 'x',
        successUrl: 'http://localhost:5173/pay/success',
        cancelUrl: 'http://localhost:5173/pay/cancel',
        methods: ['card'],
      });
      subState.set('sub1', {
        id: 'sub1',
        userId: 'user-1',
        competitionId: 'fifa-wc-2026',
        status: 'pending_payment',
        amountCents: 5000,
        stripePaymentIntentId: session.paymentIntentId,
        stripeCheckoutSessionId: session.sessionId,
        checkoutSessionExpiresAt: null,
        paidAt: null,
        refundedAt: null,
        user: { email: 'a@b.com', name: 'Ana' },
      });
      const result = await service.activateFromPaymentIntent(session.paymentIntentId!);
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
        stripeCheckoutSessionId: null,
        checkoutSessionExpiresAt: null,
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
        stripeCheckoutSessionId: null,
        checkoutSessionExpiresAt: null,
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
    function buildPiEvent(type: string, piId = 'mock_pi_x'): WebhookEvent {
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
        paymentIntentId: piId,
        checkoutSessionId: null,
      };
    }

    function buildCheckoutEvent(
      type: 'checkout.session.completed',
      sessionId: string,
      piId: string | null,
    ): WebhookEvent {
      return {
        id: `evt_${Math.random().toString(36).slice(2, 8)}`,
        type,
        paymentIntent: null,
        paymentIntentId: piId,
        checkoutSessionId: sessionId,
      };
    }

    it('skips duplicate events via processed_webhook_events PK conflict', async () => {
      const event = buildPiEvent('payment_intent.succeeded');
      subState.set('sub1', {
        id: 'sub1',
        userId: 'user-1',
        competitionId: 'fifa-wc-2026',
        status: 'pending_payment',
        amountCents: 5000,
        stripePaymentIntentId: event.paymentIntent!.id,
        stripeCheckoutSessionId: null,
        checkoutSessionExpiresAt: null,
        paidAt: null,
        refundedAt: null,
        user: { email: 'a@b.com', name: 'Ana' },
      });

      const first = await service.handleWebhookEvent(event);
      expect(first.handled).toBe(true);

      prisma.processedWebhookEvent.create.mockRejectedValueOnce(new Error('duplicate key'));
      const second = await service.handleWebhookEvent(event);
      expect(second.handled).toBe(false);
      expect(second.reason).toBe('duplicate_event');
      expect(email.sendPaymentConfirmed).toHaveBeenCalledTimes(1);
    });

    it('ignores genuinely unsupported event types', async () => {
      const event: WebhookEvent = {
        id: 'evt-unknown',
        type: 'account.updated',
        paymentIntent: null,
        paymentIntentId: null,
        checkoutSessionId: null,
      };
      const result = await service.handleWebhookEvent(event);
      expect(result.handled).toBe(false);
      expect(result.reason).toBe('unsupported_type');
    });

    it('handles checkout.session.completed by activating the subscription', async () => {
      const session = await driver.createCheckoutSession({
        userId: 'user-1',
        amountCents: 5000,
        description: 'x',
        successUrl: 'http://localhost:5173/pay/success',
        cancelUrl: 'http://localhost:5173/pay/cancel',
        methods: ['card'],
      });
      subState.set('sub1', {
        id: 'sub1',
        userId: 'user-1',
        competitionId: 'fifa-wc-2026',
        status: 'pending_payment',
        amountCents: 5000,
        stripePaymentIntentId: session.paymentIntentId,
        stripeCheckoutSessionId: session.sessionId,
        checkoutSessionExpiresAt: null,
        paidAt: null,
        refundedAt: null,
        user: { email: 'a@b.com', name: 'Ana' },
      });
      const event = buildCheckoutEvent(
        'checkout.session.completed',
        session.sessionId,
        session.paymentIntentId,
      );
      const result = await service.handleWebhookEvent(event);
      expect(result.handled).toBe(true);
      expect(subState.get('sub1')!.status).toBe('active');
    });

    it('checkout.session.completed without a PI parks the subscription (boleto path)', async () => {
      const event = buildCheckoutEvent('checkout.session.completed', 'mock_cs_xyz', null);
      const result = await service.handleWebhookEvent(event);
      expect(result.handled).toBe(true);
      // No subscription change — payment_intent.succeeded will arrive later.
      expect(subState.size).toBe(0);
    });

    it('handles charge.refunded by marking the subscription refunded', async () => {
      subState.set('sub1', {
        id: 'sub1',
        userId: 'user-1',
        competitionId: 'fifa-wc-2026',
        status: 'active',
        amountCents: 5000,
        stripePaymentIntentId: 'mock_pi_refund',
        stripeCheckoutSessionId: null,
        checkoutSessionExpiresAt: null,
        paidAt: new Date(),
        refundedAt: null,
      });
      const event: WebhookEvent = {
        id: 'evt-refund-1',
        type: 'charge.refunded',
        paymentIntent: null,
        paymentIntentId: 'mock_pi_refund',
        checkoutSessionId: null,
      };
      const result = await service.handleWebhookEvent(event);
      expect(result.handled).toBe(true);
      expect(subState.get('sub1')!.status).toBe('refunded');
      expect(subState.get('sub1')!.refundedAt).not.toBeNull();
    });

    it('charge.refunded is idempotent — already-refunded stays refunded', async () => {
      const earlier = new Date(Date.now() - 86400 * 1000);
      subState.set('sub1', {
        id: 'sub1',
        userId: 'user-1',
        competitionId: 'fifa-wc-2026',
        status: 'refunded',
        amountCents: 5000,
        stripePaymentIntentId: 'mock_pi_dup',
        stripeCheckoutSessionId: null,
        checkoutSessionExpiresAt: null,
        paidAt: earlier,
        refundedAt: earlier,
      });
      const event: WebhookEvent = {
        id: 'evt-refund-2',
        type: 'charge.refunded',
        paymentIntent: null,
        paymentIntentId: 'mock_pi_dup',
        checkoutSessionId: null,
      };
      const result = await service.handleWebhookEvent(event);
      expect(result.handled).toBe(true);
      expect(subState.get('sub1')!.refundedAt).toBe(earlier);
    });

    it('charge.refunded with no paymentIntentId is a no-op', async () => {
      const event: WebhookEvent = {
        id: 'evt-refund-3',
        type: 'charge.refunded',
        paymentIntent: null,
        paymentIntentId: null,
        checkoutSessionId: null,
      };
      const result = await service.handleWebhookEvent(event);
      expect(result.handled).toBe(false);
      expect(result.reason).toBe('no_payment_intent');
    });

    it('handles payment_intent.canceled by no-op when subscription is pending', async () => {
      subState.set('sub1', {
        id: 'sub1',
        userId: 'user-1',
        competitionId: 'fifa-wc-2026',
        status: 'pending_payment',
        amountCents: 5000,
        stripePaymentIntentId: 'mock_pi_x',
        stripeCheckoutSessionId: null,
        checkoutSessionExpiresAt: null,
        paidAt: null,
        refundedAt: null,
      });
      const event = buildPiEvent('payment_intent.canceled');
      const result = await service.handleWebhookEvent(event);
      expect(result.handled).toBe(true);
      expect(subState.get('sub1')!.status).toBe('pending_payment');
    });
  });

  describe('refund window', () => {
    async function setupActiveSubscription(paidAt: Date): Promise<string> {
      const session = await driver.createCheckoutSession({
        userId: 'user-1',
        amountCents: 5000,
        description: 'x',
        successUrl: 'http://localhost:5173/pay/success',
        cancelUrl: 'http://localhost:5173/pay/cancel',
        methods: ['card'],
      });
      driver.forceSucceed(session.sessionId);
      subState.set('sub1', {
        id: 'sub1',
        userId: 'user-1',
        competitionId: 'fifa-wc-2026',
        status: 'active',
        amountCents: 5000,
        stripePaymentIntentId: session.paymentIntentId,
        stripeCheckoutSessionId: session.sessionId,
        checkoutSessionExpiresAt: null,
        paidAt,
        refundedAt: null,
      });
      return session.paymentIntentId!;
    }

    it('refunds when paid <7d ago AND competition still open', async () => {
      await setupActiveSubscription(new Date());
      const out = await service.refund('user-1');
      expect(out.refunded).toBe(true);
      expect(subState.get('sub1')!.status).toBe('refunded');
      expect(prisma.user.update).toHaveBeenCalledWith(
        expect.objectContaining({ data: { role: 'player' } }),
      );
    });

    it('rejects when paid >7d ago', async () => {
      await setupActiveSubscription(new Date(Date.now() - 8 * 24 * 3600 * 1000));
      await expect(service.refund('user-1')).rejects.toBeInstanceOf(ForbiddenException);
    });

    it('rejects when competition is locked', async () => {
      competition.getMain.mockResolvedValueOnce({
        id: 'fifa-wc-2026',
        locksAt: new Date(Date.now() - 1_000),
      });
      await setupActiveSubscription(new Date());
      await expect(service.refund('user-1')).rejects.toBeInstanceOf(ForbiddenException);
    });
  });
});
