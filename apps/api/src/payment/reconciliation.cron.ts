import { Inject, Injectable, Logger } from '@nestjs/common';
import { Cron, CronExpression } from '@nestjs/schedule';
import { PrismaService } from '../prisma/prisma.service';
import { PaymentService } from './payment.service';
import { PAYMENT_DRIVER } from './payment.tokens';
import type { IPaymentDriver } from './drivers/payment-driver.interface';

/**
 * Catch-net for webhooks that never arrived: every day at 03:00 BRT
 * (06:00 UTC) we sweep recent Stripe payment intents and activate any
 * locally-pending subscription that the provider reports as succeeded.
 *
 * Idempotent: re-activating an already-active subscription is a no-op.
 * Skipped entirely when STRIPE_DRIVER=mock — mock state lives only in
 * the running process so a sweep would find nothing useful.
 */
@Injectable()
export class ReconciliationCron {
  private readonly logger = new Logger(ReconciliationCron.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly payment: PaymentService,
    @Inject(PAYMENT_DRIVER) private readonly driver: IPaymentDriver,
  ) {}

  @Cron(CronExpression.EVERY_DAY_AT_3AM, {
    timeZone: 'America/Sao_Paulo',
    name: 'stripe-reconciliation',
  })
  async run(): Promise<void> {
    if (this.driver.name === 'mock') {
      this.logger.debug('Skipping reconciliation: mock driver in use');
      return;
    }
    const since = Math.floor((Date.now() - 24 * 3600 * 1000) / 1000);
    let activated = 0;
    let skipped = 0;
    let errors = 0;

    try {
      const recent = await this.driver.listRecentPaymentIntents(since);
      for (const pi of recent) {
        if (pi.status !== 'succeeded') {
          skipped += 1;
          continue;
        }
        try {
          const result = await this.payment.activateFromPaymentIntent(pi.id);
          if (result.activated) activated += 1;
          else skipped += 1;
        } catch (e) {
          errors += 1;
          this.logger.warn(
            `Reconciliation failed for PI ${pi.id}: ${(e as Error).message}`,
          );
        }
      }
    } catch (e) {
      this.logger.error(`Reconciliation sweep failed: ${(e as Error).message}`);
      return;
    }

    this.logger.log(
      `Reconciliation finished: activated=${activated}, skipped=${skipped}, errors=${errors}`,
    );
  }
}
