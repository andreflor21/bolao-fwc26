import {
  ConflictException,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PrismaService } from '../prisma/prisma.service';
import { EmailService } from '../email/email.service';
import { FIFA_WC_2026_ID } from '@bolao/shared';

@Injectable()
export class SubscriptionService {
  private readonly logger = new Logger(SubscriptionService.name);
  private readonly amountCents: number;

  constructor(
    private readonly prisma: PrismaService,
    private readonly email: EmailService,
    config: ConfigService,
  ) {
    this.amountCents = Number(config.get('SUBSCRIPTION_AMOUNT_CENTS') ?? 5000);
  }

  async getStatus(userId: string) {
    const sub = await this.prisma.subscription.findUnique({
      where: { userId_competitionId: { userId, competitionId: FIFA_WC_2026_ID } },
      select: {
        id: true,
        status: true,
        amountCents: true,
        paidAt: true,
        refundedAt: true,
        createdAt: true,
      },
    });
    return sub ?? { status: 'not_subscribed' as const };
  }

  async createOrGet(userId: string) {
    const existing = await this.prisma.subscription.findUnique({
      where: { userId_competitionId: { userId, competitionId: FIFA_WC_2026_ID } },
    });
    if (existing && existing.status === 'active') {
      throw new ConflictException('Subscription is already active');
    }
    if (existing) {
      return existing;
    }
    const competition = await this.prisma.competition.findUnique({
      where: { id: FIFA_WC_2026_ID },
      select: { id: true, closureStatus: true, locksAt: true },
    });
    if (!competition) throw new NotFoundException('Competition not initialized — run seed');
    if (competition.closureStatus !== 'open') {
      throw new ConflictException('Subscriptions are closed for this competition');
    }
    if (competition.locksAt < new Date()) {
      throw new ConflictException('Competition has already started — no new subscriptions');
    }

    return this.prisma.subscription.create({
      data: {
        userId,
        competitionId: FIFA_WC_2026_ID,
        status: 'pending_payment',
        amountCents: this.amountCents,
      },
    });
  }

  /**
   * Dev/test only: pretends the Pix payment was confirmed.
   * In production this is driven by the Stripe webhook (Sprint 3).
   */
  async mockConfirmPayment(userId: string) {
    const sub = await this.prisma.subscription.findUnique({
      where: { userId_competitionId: { userId, competitionId: FIFA_WC_2026_ID } },
      include: { user: { select: { email: true, name: true } } },
    });
    if (!sub) throw new NotFoundException('No subscription to confirm');
    if (sub.status === 'active') return sub;

    const updated = await this.prisma.$transaction(async (tx) => {
      const next = await tx.subscription.update({
        where: { id: sub.id },
        data: {
          status: 'active',
          paidAt: new Date(),
          stripePaymentIntentId: `mock_pi_${sub.id}`,
        },
      });
      await tx.user.update({
        where: { id: userId },
        data: { role: 'subscriber' },
      });
      return next;
    });

    await this.email
      .sendPaymentConfirmed(sub.user.email, sub.user.name)
      .catch((err) => this.logger.warn(`Email failed: ${err.message}`));

    return updated;
  }
}
