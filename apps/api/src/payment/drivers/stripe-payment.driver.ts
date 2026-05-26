import { Logger } from '@nestjs/common';
import type { StripeApi } from './stripe-types';
import type {
  CreatePixIntentInput,
  IPaymentDriver,
  PaymentIntentSnapshot,
  PaymentIntentStatus,
  PixPaymentIntent,
  RefundResult,
  WebhookEvent,
} from './payment-driver.interface';

export class StripePaymentDriver implements IPaymentDriver {
  readonly name = 'stripe' as const;
  private readonly logger = new Logger(StripePaymentDriver.name);

  constructor(
    private readonly stripe: StripeApi,
    private readonly webhookSecret: string,
  ) {}

  async createPixPaymentIntent(input: CreatePixIntentInput): Promise<PixPaymentIntent> {
    const pi = await this.stripe.paymentIntents.create(
      {
        amount: input.amountCents,
        currency: 'brl',
        payment_method_types: ['pix'],
        payment_method_data: { type: 'pix' },
        confirm: true,
        metadata: {
          userId: input.userId,
          ...(input.metadata ?? {}),
        },
        payment_method_options: input.expiresInSeconds
          ? { pix: { expires_after_seconds: input.expiresInSeconds } }
          : undefined,
      },
      // Idempotency-Key bound to user so retries don't open a second PI.
      { idempotencyKey: `pi-create-${input.userId}` },
    );

    const pix = pi.next_action?.pix_display_qr_code;
    if (!pix?.data || !pix?.image_url_png) {
      throw new Error(
        `Stripe PI ${pi.id} did not return a Pix QR code (status=${pi.status})`,
      );
    }

    return {
      paymentIntentId: pi.id,
      clientSecret: pi.client_secret,
      status: this.mapStatus(pi.status),
      amountCents: pi.amount,
      metadata: pi.metadata ?? {},
      pix: {
        qrCodeText: pix.data,
        qrCodePngUrl: pix.image_url_png,
        expiresAt: pix.expires_at
          ? new Date(pix.expires_at * 1000).toISOString()
          : new Date(Date.now() + 24 * 3600 * 1000).toISOString(),
      },
    };
  }

  async retrieve(paymentIntentId: string): Promise<PaymentIntentSnapshot> {
    const pi = await this.stripe.paymentIntents.retrieve(paymentIntentId);
    return this.toSnapshot(pi);
  }

  async refund(paymentIntentId: string): Promise<RefundResult> {
    const refund = await this.stripe.refunds.create(
      { payment_intent: paymentIntentId },
      { idempotencyKey: `refund-${paymentIntentId}` },
    );
    return {
      refundId: refund.id,
      paymentIntentId,
      amountCents: refund.amount,
      createdAt: new Date(refund.created * 1000).toISOString(),
    };
  }

  parseWebhookEvent(rawBody: Buffer, signatureHeader: string | null): WebhookEvent {
    if (!signatureHeader) {
      throw new Error('Missing Stripe-Signature header');
    }
    const event = this.stripe.webhooks.constructEvent(
      rawBody,
      signatureHeader,
      this.webhookSecret,
    );
    const paymentIntent =
      event.data.object && (event.data.object as { object?: string }).object === 'payment_intent'
        ? this.toSnapshot(event.data.object as StripeApi.PaymentIntent)
        : null;
    return { id: event.id, type: event.type, paymentIntent };
  }

  async listRecentPaymentIntents(since: number): Promise<PaymentIntentSnapshot[]> {
    const result: PaymentIntentSnapshot[] = [];
    for await (const pi of this.stripe.paymentIntents.list({
      created: { gte: since },
      limit: 100,
    })) {
      result.push(this.toSnapshot(pi));
    }
    return result;
  }

  private toSnapshot(pi: StripeApi.PaymentIntent): PaymentIntentSnapshot {
    const succeededAt =
      pi.status === 'succeeded' && pi.latest_charge && typeof pi.latest_charge !== 'string'
        ? new Date(pi.latest_charge.created * 1000).toISOString()
        : pi.status === 'succeeded'
          ? new Date(pi.created * 1000).toISOString()
          : null;
    const canceledAt = pi.canceled_at ? new Date(pi.canceled_at * 1000).toISOString() : null;
    return {
      id: pi.id,
      status: this.mapStatus(pi.status),
      amountCents: pi.amount,
      metadata: pi.metadata ?? {},
      createdAt: new Date(pi.created * 1000).toISOString(),
      succeededAt,
      canceledAt,
    };
  }

  private mapStatus(s: StripeApi.PaymentIntent.Status): PaymentIntentStatus {
    // Stripe statuses already align 1:1 with our subset, but be explicit for type safety.
    switch (s) {
      case 'requires_payment_method':
      case 'requires_confirmation':
      case 'requires_action':
      case 'processing':
      case 'requires_capture':
      case 'succeeded':
      case 'canceled':
        return s;
      default:
        return 'failed';
    }
  }
}
