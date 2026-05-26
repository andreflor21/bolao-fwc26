import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Inject,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PrismaService } from '../prisma/prisma.service';
import { EmailService } from '../email/email.service';
import { CompetitionService } from '../competition/competition.service';
import { FIFA_WC_2026_ID } from '@bolao/shared';
import { PAYMENT_DRIVER } from './payment.tokens';
import type {
  CheckoutSession,
  IPaymentDriver,
  PaymentIntentSnapshot,
  PaymentMethodKey,
  WebhookEvent,
} from './drivers/payment-driver.interface';

export interface CreateCheckoutSessionResponse {
  sessionId: string;
  /** Hosted checkout URL — frontend redirects the browser to this. */
  checkoutUrl: string;
  expiresAt: string;
  amountCents: number;
  /** Subscription status from our DB — the source of truth post-webhook. */
  subscriptionStatus: 'pending_payment' | 'active' | 'refunded';
  /** ISO list of methods enabled for this session (shown in UI as a heads-up). */
  methods: PaymentMethodKey[];
}

export interface PaymentStatusResponse {
  sessionId: string | null;
  paymentIntentId: string | null;
  paymentIntentStatus: PaymentIntentSnapshot['status'] | null;
  checkoutSessionStatus: CheckoutSession['status'] | null;
  subscriptionStatus: 'pending_payment' | 'active' | 'refunded';
  paidAt: string | null;
}

const REFUND_WINDOW_DAYS = 7;
const DEFAULT_METHODS: PaymentMethodKey[] = ['card', 'link', 'boleto'];

@Injectable()
export class PaymentService {
  private readonly logger = new Logger(PaymentService.name);
  private readonly amountCents: number;
  private readonly methods: PaymentMethodKey[];
  private readonly boletoExpiresAfterDays: number;
  private readonly webOrigin: string;

  constructor(
    @Inject(PAYMENT_DRIVER) private readonly driver: IPaymentDriver,
    private readonly prisma: PrismaService,
    private readonly email: EmailService,
    private readonly competition: CompetitionService,
    config: ConfigService,
  ) {
    this.amountCents = Number(config.get('SUBSCRIPTION_AMOUNT_CENTS') ?? 5000);
    this.boletoExpiresAfterDays = Number(config.get('STRIPE_BOLETO_EXPIRES_AFTER_DAYS') ?? 3);
    this.webOrigin = config.get<string>('WEB_ORIGIN') ?? 'http://localhost:5173';
    const raw = config.get<string>('STRIPE_CHECKOUT_METHODS');
    if (raw) {
      const parsed = raw
        .split(',')
        .map((m) => m.trim().toLowerCase())
        .filter((m): m is PaymentMethodKey =>
          ['card', 'link', 'boleto', 'pix', 'apple_pay'].includes(m),
        );
      this.methods = parsed.length > 0 ? parsed : DEFAULT_METHODS;
    } else {
      this.methods = DEFAULT_METHODS;
    }
    this.logger.log(`Checkout methods: ${this.methods.join(', ')}`);
  }

  /**
   * Returns an active Checkout Session URL for the user. Reuses the existing
   * session row when it's still open and unexpired; otherwise creates a new
   * one (and stores its ID + expiry on the subscription row).
   */
  async createOrGetCheckoutSession(userId: string): Promise<CreateCheckoutSessionResponse> {
    await this.competition.assertOpen();

    const existing = await this.prisma.subscription.findUnique({
      where: { userId_competitionId: { userId, competitionId: FIFA_WC_2026_ID } },
    });

    if (existing?.status === 'active') {
      throw new ConflictException({
        code: 'ALREADY_ACTIVE',
        message: 'Subscription is already active',
      });
    }
    if (existing?.status === 'refunded') {
      throw new ConflictException({
        code: 'SUBSCRIPTION_REFUNDED',
        message: 'This subscription was refunded — contact support to re-subscribe',
      });
    }

    const subscription =
      existing ??
      (await this.prisma.subscription.create({
        data: {
          userId,
          competitionId: FIFA_WC_2026_ID,
          status: 'pending_payment',
          amountCents: this.amountCents,
        },
      }));

    // Reuse an active, unexpired session when we can — avoids creating a
    // fresh Checkout every time the user comes back to /pay.
    if (
      subscription.stripeCheckoutSessionId &&
      subscription.checkoutSessionExpiresAt &&
      subscription.checkoutSessionExpiresAt.getTime() > Date.now()
    ) {
      try {
        const refreshed = await this.driver.retrieveCheckoutSession(
          subscription.stripeCheckoutSessionId,
        );
        if (refreshed.status === 'open') {
          return this.toCreateResponse(subscription.status, refreshed);
        }
        // Session ended in expired/complete state — fall through to recreate.
      } catch (e) {
        this.logger.warn(
          `Failed to refresh session ${subscription.stripeCheckoutSessionId}: ${(e as Error).message} — creating a new one`,
        );
      }
    }

    const session = await this.driver.createCheckoutSession({
      userId,
      amountCents: subscription.amountCents,
      description: 'Inscrição Bolão Copa do Mundo FIFA 2026',
      successUrl: `${this.webOrigin}/pay/success?sid={CHECKOUT_SESSION_ID}`,
      cancelUrl: `${this.webOrigin}/pay/cancel`,
      methods: this.methods,
      boletoExpiresAfterDays: this.boletoExpiresAfterDays,
      clientReferenceId: subscription.id,
      metadata: { competitionId: FIFA_WC_2026_ID, subscriptionId: subscription.id },
    });

    await this.prisma.subscription.update({
      where: { id: subscription.id },
      data: {
        stripeCheckoutSessionId: session.sessionId,
        checkoutSessionExpiresAt: new Date(session.expiresAt),
        // Stripe may attach a PI to the session right away; persist it so
        // refunds + reconciliation can find it later.
        ...(session.paymentIntentId
          ? { stripePaymentIntentId: session.paymentIntentId }
          : {}),
      },
    });

    return this.toCreateResponse(subscription.status, session);
  }

  async getOwnCheckoutSessionId(userId: string): Promise<string | null> {
    const subscription = await this.prisma.subscription.findUnique({
      where: { userId_competitionId: { userId, competitionId: FIFA_WC_2026_ID } },
      select: { stripeCheckoutSessionId: true },
    });
    return subscription?.stripeCheckoutSessionId ?? null;
  }

  /**
   * Status for the user's pay page — combines local DB truth (subscription
   * status, paidAt) with provider-side state (PI and session statuses) so
   * the UI can show "processing", "succeeded", etc. straight after the user
   * returns from the hosted checkout.
   */
  async getPaymentStatus(userId: string, sessionId?: string): Promise<PaymentStatusResponse> {
    const subscription = await this.prisma.subscription.findUnique({
      where: { userId_competitionId: { userId, competitionId: FIFA_WC_2026_ID } },
    });
    if (!subscription) {
      throw new NotFoundException('No subscription for this user');
    }
    const sid = sessionId ?? subscription.stripeCheckoutSessionId;
    if (sid && subscription.stripeCheckoutSessionId !== sid) {
      throw new ForbiddenException('Session does not belong to this user');
    }

    let providerSessionStatus: CheckoutSession['status'] | null = null;
    let providerPiStatus: PaymentIntentSnapshot['status'] | null = null;
    let resolvedPiId: string | null = subscription.stripePaymentIntentId;

    if (sid) {
      try {
        const session = await this.driver.retrieveCheckoutSession(sid);
        providerSessionStatus = session.status;
        if (session.paymentIntentId) {
          resolvedPiId = session.paymentIntentId;
          // If the session just attached a PI we hadn't persisted yet, write it.
          if (!subscription.stripePaymentIntentId) {
            await this.prisma.subscription.update({
              where: { id: subscription.id },
              data: { stripePaymentIntentId: session.paymentIntentId },
            });
          }
        }
      } catch (e) {
        this.logger.warn(`retrieveCheckoutSession failed for ${sid}: ${(e as Error).message}`);
      }
    }

    if (resolvedPiId) {
      try {
        const pi = await this.driver.retrieve(resolvedPiId);
        providerPiStatus = pi.status;
      } catch (e) {
        this.logger.warn(`retrieve PI failed for ${resolvedPiId}: ${(e as Error).message}`);
      }
    }

    return {
      sessionId: subscription.stripeCheckoutSessionId,
      paymentIntentId: resolvedPiId,
      paymentIntentStatus: providerPiStatus,
      checkoutSessionStatus: providerSessionStatus,
      subscriptionStatus: subscription.status,
      paidAt: subscription.paidAt?.toISOString() ?? null,
    };
  }

  async refund(userId: string): Promise<{ refunded: true; refundId: string; amountCents: number }> {
    const competition = await this.competition.getMain();
    if (competition.locksAt <= new Date()) {
      throw new ForbiddenException({
        code: 'LOCKED_COMPETITION',
        message: 'Competition is locked — refunds are no longer allowed',
      });
    }

    const subscription = await this.prisma.subscription.findUnique({
      where: { userId_competitionId: { userId, competitionId: FIFA_WC_2026_ID } },
    });
    if (!subscription) throw new NotFoundException('No subscription to refund');
    if (subscription.status !== 'active') {
      throw new BadRequestException('Only active subscriptions can be refunded');
    }
    if (!subscription.paidAt || !subscription.stripePaymentIntentId) {
      throw new BadRequestException('Subscription has no recorded payment');
    }
    const windowMs = REFUND_WINDOW_DAYS * 24 * 3600 * 1000;
    if (subscription.paidAt.getTime() + windowMs <= Date.now()) {
      throw new ForbiddenException({
        code: 'REFUND_WINDOW_CLOSED',
        message: `Refunds are only available within ${REFUND_WINDOW_DAYS} days of payment`,
      });
    }

    const result = await this.driver.refund(subscription.stripePaymentIntentId);
    await this.prisma.$transaction([
      this.prisma.subscription.update({
        where: { id: subscription.id },
        data: {
          status: 'refunded',
          refundedAt: new Date(result.createdAt),
          refundedAmountCents: result.amountCents,
          stripeRefundId: result.refundId,
        },
      }),
      this.prisma.user.update({
        where: { id: userId },
        data: { role: 'player' },
      }),
    ]);

    this.logger.log(`Refunded subscription ${subscription.id} for user ${userId}`);
    return { refunded: true, refundId: result.refundId, amountCents: result.amountCents };
  }

  /**
   * Idempotent activation triggered by webhook (or reconciliation cron).
   * Returns `{ activated: false }` when the subscription is already active
   * or no subscription matches the PI.
   */
  async activateFromPaymentIntent(
    paymentIntentId: string,
  ): Promise<{ activated: boolean; reason?: string }> {
    const subscription = await this.prisma.subscription.findUnique({
      where: { stripePaymentIntentId: paymentIntentId },
      include: { user: { select: { email: true, name: true } } },
    });
    if (!subscription) {
      return { activated: false, reason: 'subscription_not_found' };
    }
    if (subscription.status === 'active') {
      return { activated: false, reason: 'already_active' };
    }
    if (subscription.status === 'refunded') {
      this.logger.warn(
        `Refusing to re-activate refunded subscription ${subscription.id} on PI ${paymentIntentId}`,
      );
      return { activated: false, reason: 'refunded' };
    }

    const now = new Date();
    await this.prisma.$transaction([
      this.prisma.subscription.update({
        where: { id: subscription.id },
        data: { status: 'active', paidAt: now },
      }),
      this.prisma.user.update({
        where: { id: subscription.userId },
        data: { role: 'subscriber' },
      }),
    ]);

    await this.email
      .sendPaymentConfirmed(subscription.user.email, subscription.user.name)
      .catch((e) => this.logger.warn(`Confirmation email failed: ${(e as Error).message}`));

    this.logger.log(
      `Activated subscription ${subscription.id} for user ${subscription.userId} via PI ${paymentIntentId}`,
    );
    return { activated: true };
  }

  /**
   * Activation from a Checkout Session — used when the webhook fires before
   * the session has been hydrated with a PI locally. Looks up by session ID,
   * persists the PI if we didn't have it, then delegates to
   * `activateFromPaymentIntent` for the actual state mutation.
   */
  async activateFromCheckoutSession(
    sessionId: string,
    paymentIntentId: string | null,
  ): Promise<{ activated: boolean; reason?: string }> {
    if (!paymentIntentId) {
      // Card/Apple Pay/Link complete instantly with a PI; boleto/pix may not.
      // Without a PI we can't move the subscription forward — the next event
      // (payment_intent.succeeded) will.
      return { activated: false, reason: 'no_payment_intent_yet' };
    }
    const sub = await this.prisma.subscription.findUnique({
      where: { stripeCheckoutSessionId: sessionId },
      select: { id: true, stripePaymentIntentId: true },
    });
    if (!sub) return { activated: false, reason: 'subscription_not_found' };

    if (sub.stripePaymentIntentId !== paymentIntentId) {
      await this.prisma.subscription.update({
        where: { id: sub.id },
        data: { stripePaymentIntentId: paymentIntentId },
      });
    }
    return this.activateFromPaymentIntent(paymentIntentId);
  }

  async markPaymentFailed(paymentIntentId: string, reason: string): Promise<void> {
    const subscription = await this.prisma.subscription.findUnique({
      where: { stripePaymentIntentId: paymentIntentId },
    });
    if (!subscription || subscription.status !== 'pending_payment') return;
    this.logger.log(`Payment failed for PI ${paymentIntentId}: ${reason}`);
  }

  /**
   * Idempotent refund-from-webhook: invoked when Stripe tells us a charge
   * for one of our PIs has been refunded outside the app (manual dashboard
   * action, dispute auto-refund, etc.). Mirrors {@link refund} but doesn't
   * call the provider (the refund already happened upstream) and skips the
   * 7-day window check.
   */
  async markRefundedFromPaymentIntent(
    paymentIntentId: string,
  ): Promise<{ marked: boolean; reason?: string }> {
    const subscription = await this.prisma.subscription.findUnique({
      where: { stripePaymentIntentId: paymentIntentId },
    });
    if (!subscription) return { marked: false, reason: 'subscription_not_found' };
    if (subscription.status === 'refunded') {
      return { marked: false, reason: 'already_refunded' };
    }

    const now = new Date();
    await this.prisma.$transaction([
      this.prisma.subscription.update({
        where: { id: subscription.id },
        data: { status: 'refunded', refundedAt: now },
      }),
      this.prisma.user.update({
        where: { id: subscription.userId },
        data: { role: 'player' },
      }),
    ]);
    this.logger.log(
      `Marked subscription ${subscription.id} as refunded via webhook (PI ${paymentIntentId})`,
    );
    return { marked: true };
  }

  /**
   * Processes a parsed webhook event idempotently. The event ID is recorded
   * in `processed_webhook_events` BEFORE handler execution so concurrent
   * deliveries no-op safely (PK conflict ⇒ silent skip).
   */
  async handleWebhookEvent(event: WebhookEvent, source = 'stripe'): Promise<{ handled: boolean; reason?: string }> {
    try {
      await this.prisma.processedWebhookEvent.create({
        data: { id: event.id, source },
      });
    } catch {
      return { handled: false, reason: 'duplicate_event' };
    }

    switch (event.type) {
      case 'checkout.session.completed': {
        if (!event.checkoutSessionId) return { handled: false, reason: 'no_session' };
        await this.activateFromCheckoutSession(event.checkoutSessionId, event.paymentIntentId);
        return { handled: true };
      }
      case 'payment_intent.succeeded': {
        if (!event.paymentIntent) return { handled: false, reason: 'no_payment_intent' };
        await this.activateFromPaymentIntent(event.paymentIntent.id);
        return { handled: true };
      }
      case 'payment_intent.payment_failed': {
        if (!event.paymentIntent) return { handled: false, reason: 'no_payment_intent' };
        await this.markPaymentFailed(event.paymentIntent.id, 'payment_failed');
        return { handled: true };
      }
      case 'payment_intent.canceled': {
        if (!event.paymentIntent) return { handled: false, reason: 'no_payment_intent' };
        await this.markPaymentFailed(event.paymentIntent.id, 'canceled');
        return { handled: true };
      }
      case 'charge.refunded': {
        if (!event.paymentIntentId) return { handled: false, reason: 'no_payment_intent' };
        await this.markRefundedFromPaymentIntent(event.paymentIntentId);
        return { handled: true };
      }
      default:
        this.logger.debug(`Ignoring webhook event type ${event.type}`);
        return { handled: false, reason: 'unsupported_type' };
    }
  }

  private toCreateResponse(
    subscriptionStatus: 'pending_payment' | 'active' | 'refunded',
    session: CheckoutSession,
  ): CreateCheckoutSessionResponse {
    return {
      sessionId: session.sessionId,
      checkoutUrl: session.url,
      expiresAt: session.expiresAt,
      amountCents: session.amountCents || this.amountCents,
      subscriptionStatus,
      methods: this.methods,
    };
  }
}
