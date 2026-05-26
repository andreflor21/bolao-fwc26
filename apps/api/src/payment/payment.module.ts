import { Logger, Module, type Provider } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import Stripe from 'stripe';
import type { StripeApi } from './drivers/stripe-types';
import { PaymentController } from './payment.controller';
import { WebhookController } from './webhook.controller';
import { PaymentService } from './payment.service';
import { ReconciliationCron } from './reconciliation.cron';
import { MockPaymentDriver } from './drivers/mock-payment.driver';
import { StripePaymentDriver } from './drivers/stripe-payment.driver';
import { PAYMENT_DRIVER } from './payment.tokens';

const paymentDriverProvider: Provider = {
  provide: PAYMENT_DRIVER,
  inject: [ConfigService],
  useFactory: (config: ConfigService) => {
    const choice = (config.get<string>('STRIPE_DRIVER') ?? 'mock').toLowerCase();
    const env = config.get<string>('NODE_ENV') ?? 'development';

    if (choice === 'stripe') {
      const secret = config.get<string>('STRIPE_SECRET_KEY');
      const webhookSecret = config.get<string>('STRIPE_WEBHOOK_SECRET');
      if (!secret) throw new Error('STRIPE_SECRET_KEY is required when STRIPE_DRIVER=stripe');
      if (!webhookSecret)
        throw new Error('STRIPE_WEBHOOK_SECRET is required when STRIPE_DRIVER=stripe');
      const stripe = new Stripe(secret, {
        typescript: true,
        appInfo: { name: 'bolao-copa-2026', version: '0.1.0' },
      }) as unknown as StripeApi;
      Logger.log('Using real Stripe payment driver', 'PaymentModule');
      return new StripePaymentDriver(stripe, webhookSecret);
    }

    if (env === 'production') {
      throw new Error(
        `Refusing to start with STRIPE_DRIVER='${choice}' in production — set STRIPE_DRIVER=stripe`,
      );
    }
    Logger.log('Using mock payment driver (dev/CI only)', 'PaymentModule');
    return new MockPaymentDriver();
  },
};

@Module({
  controllers: [PaymentController, WebhookController],
  providers: [PaymentService, ReconciliationCron, paymentDriverProvider],
  exports: [PaymentService, PAYMENT_DRIVER],
})
export class PaymentModule {}
