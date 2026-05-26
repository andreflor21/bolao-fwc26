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
  IPaymentDriver,
  PaymentIntentSnapshot,
  PixPaymentIntent,
  WebhookEvent,
} from './drivers/payment-driver.interface';

export interface CreatePaymentIntentResponse {
  paymentIntentId: string;
  qrCodeText: string;
  qrCodePngUrl: string;
  expiresAt: string;
  amountCents: number;
  /** Subscription status from our DB — the source of truth post-webhook. */
  subscriptionStatus: 'pending_payment' | 'active' | 'refunded';
}

export interface PaymentIntentStatusResponse {
  paymentIntentId: string;
  paymentIntentStatus: PaymentIntentSnapshot['status'] | null;
  subscriptionStatus: 'pending_payment' | 'active' | 'refunded';
  paidAt: string | null;
}

const REFUND_WINDOW_DAYS = 7;

@Injectable()
export class PaymentService {
  private readonly logger = new Logger(PaymentService.name);
  private readonly amountCents: number;
  private readonly piExpiresInSeconds: number;

  constructor(
    @Inject(PAYMENT_DRIVER) private readonly driver: IPaymentDriver,
    private readonly prisma: PrismaService,
    private readonly email: EmailService,
    private readonly competition: CompetitionService,
    config: ConfigService,
  ) {
    this.amountCents = Number(config.get('SUBSCRIPTION_AMOUNT_CENTS') ?? 5000);
    this.piExpiresInSeconds = 24 * 3600;
  }

  /**
   * Returns the active PI for the user — creating a subscription row if
   * needed and a fresh PI if none exists or the existing one is unusable.
   */
  async createOrGetPaymentIntent(userId: string): Promise<CreatePaymentIntentResponse> {
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

    // Reuse a previously-created PI if it's still usable.
    if (subscription.stripePaymentIntentId) {
      try {
        const snapshot = await this.driver.retrieve(subscription.stripePaymentIntentId);
        if (
          snapshot.status === 'requires_payment_method' ||
          snapshot.status === 'requires_action' ||
          snapshot.status === 'requires_confirmation' ||
          snapshot.status === 'processing'
        ) {
          // Existing PI still usable. Re-fetch with full Pix details by creating
          // a sibling "fresh view" — most drivers return Pix info on retrieve()
          // only via raw next_action. Cheapest: just refetch via driver.create.
          // To stay simple, fall through to create a new PI; the driver's
          // idempotency key prevents duplicates.
        }
      } catch (e) {
        this.logger.warn(
          `Failed to retrieve existing PI ${subscription.stripePaymentIntentId}: ${(e as Error).message} — creating a new one`,
        );
      }
    }

    const pi = await this.driver.createPixPaymentIntent({
      userId,
      amountCents: subscription.amountCents,
      metadata: { competitionId: FIFA_WC_2026_ID, subscriptionId: subscription.id },
      expiresInSeconds: this.piExpiresInSeconds,
    });

    if (subscription.stripePaymentIntentId !== pi.paymentIntentId) {
      await this.prisma.subscription.update({
        where: { id: subscription.id },
        data: { stripePaymentIntentId: pi.paymentIntentId },
      });
    }

    return this.toCreateResponse(subscription.status, pi);
  }

  async getOwnPaymentIntentId(userId: string): Promise<string | null> {
    const subscription = await this.prisma.subscription.findUnique({
      where: { userId_competitionId: { userId, competitionId: FIFA_WC_2026_ID } },
      select: { stripePaymentIntentId: true },
    });
    return subscription?.stripePaymentIntentId ?? null;
  }

  async getPaymentIntentStatus(
    userId: string,
    paymentIntentId: string,
  ): Promise<PaymentIntentStatusResponse> {
    const subscription = await this.prisma.subscription.findUnique({
      where: { userId_competitionId: { userId, competitionId: FIFA_WC_2026_ID } },
    });
    if (!subscription || subscription.stripePaymentIntentId !== paymentIntentId) {
      throw new NotFoundException('Payment intent does not belong to this user');
    }

    let providerStatus: PaymentIntentSnapshot['status'] | null = null;
    try {
      const snapshot = await this.driver.retrieve(paymentIntentId);
      providerStatus = snapshot.status;
    } catch (e) {
      this.logger.warn(`Provider retrieve failed for ${paymentIntentId}: ${(e as Error).message}`);
    }

    return {
      paymentIntentId,
      paymentIntentStatus: providerStatus,
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

  async markPaymentFailed(paymentIntentId: string, reason: string): Promise<void> {
    const subscription = await this.prisma.subscription.findUnique({
      where: { stripePaymentIntentId: paymentIntentId },
    });
    if (!subscription || subscription.status !== 'pending_payment') return;
    this.logger.log(`Payment failed for PI ${paymentIntentId}: ${reason}`);
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
      default:
        this.logger.debug(`Ignoring webhook event type ${event.type}`);
        return { handled: false, reason: 'unsupported_type' };
    }
  }

  private toCreateResponse(
    subscriptionStatus: 'pending_payment' | 'active' | 'refunded',
    pi: PixPaymentIntent,
  ): CreatePaymentIntentResponse {
    return {
      paymentIntentId: pi.paymentIntentId,
      qrCodeText: pi.pix.qrCodeText,
      qrCodePngUrl: pi.pix.qrCodePngUrl,
      expiresAt: pi.pix.expiresAt,
      amountCents: pi.amountCents,
      subscriptionStatus,
    };
  }
}
