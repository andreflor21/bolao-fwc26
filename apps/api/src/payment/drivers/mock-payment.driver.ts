import { Logger } from '@nestjs/common';
import { randomBytes } from 'node:crypto';
import type {
  CreatePixIntentInput,
  IPaymentDriver,
  PaymentIntentSnapshot,
  PixPaymentIntent,
  RefundResult,
  WebhookEvent,
} from './payment-driver.interface';

/**
 * In-memory mock payment driver for dev and CI. Generates deterministic-ish
 * fake Pix payment intents. Provides `forceSucceed()` for tests / dev flows
 * to flip a PI to `succeeded` and let the webhook handler run the same code
 * path as production.
 */
export class MockPaymentDriver implements IPaymentDriver {
  readonly name = 'mock' as const;
  private readonly logger = new Logger(MockPaymentDriver.name);
  private readonly intents = new Map<string, PaymentIntentSnapshot>();

  async createPixPaymentIntent(input: CreatePixIntentInput): Promise<PixPaymentIntent> {
    const id = `mock_pi_${randomBytes(12).toString('hex')}`;
    const now = new Date();
    const expiresAt = new Date(now.getTime() + (input.expiresInSeconds ?? 24 * 3600) * 1000);
    const snapshot: PaymentIntentSnapshot = {
      id,
      status: 'requires_payment_method',
      amountCents: input.amountCents,
      metadata: input.metadata ?? {},
      createdAt: now.toISOString(),
      succeededAt: null,
      canceledAt: null,
    };
    this.intents.set(id, snapshot);
    this.logger.debug(`Created mock PI ${id} for user ${input.userId} (${input.amountCents}c)`);

    const qrText = `00020126360014BR.GOV.BCB.PIX0114bolao+mock+${id}5204000053039865802BR5913BOLAO MOCK6009SAO PAULO62070503***6304ABCD`;
    return {
      paymentIntentId: id,
      clientSecret: null,
      status: snapshot.status,
      amountCents: snapshot.amountCents,
      metadata: snapshot.metadata,
      pix: {
        qrCodeText: qrText,
        // 1x1 transparent PNG — frontend can fall back to client-side qrcode lib if needed.
        qrCodePngUrl:
          'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNkYAAAAAYAAjCB0C8AAAAASUVORK5CYII=',
        expiresAt: expiresAt.toISOString(),
      },
    };
  }

  async retrieve(paymentIntentId: string): Promise<PaymentIntentSnapshot> {
    const pi = this.intents.get(paymentIntentId);
    if (!pi) {
      throw new Error(`Mock PI ${paymentIntentId} not found`);
    }
    return pi;
  }

  async refund(paymentIntentId: string): Promise<RefundResult> {
    const pi = this.intents.get(paymentIntentId);
    if (!pi) throw new Error(`Mock PI ${paymentIntentId} not found`);
    if (pi.status !== 'succeeded') {
      throw new Error(`Cannot refund mock PI ${paymentIntentId} in status ${pi.status}`);
    }
    return {
      refundId: `mock_re_${randomBytes(8).toString('hex')}`,
      paymentIntentId,
      amountCents: pi.amountCents,
      createdAt: new Date().toISOString(),
    };
  }

  parseWebhookEvent(rawBody: Buffer, _signatureHeader: string | null): WebhookEvent {
    // Mock driver accepts JSON envelopes without HMAC. NOT FOR PRODUCTION.
    const parsed = JSON.parse(rawBody.toString('utf8')) as {
      id: string;
      type: string;
      paymentIntent?: PaymentIntentSnapshot;
    };
    return {
      id: parsed.id,
      type: parsed.type,
      paymentIntent: parsed.paymentIntent ?? null,
    };
  }

  async listRecentPaymentIntents(since: number): Promise<PaymentIntentSnapshot[]> {
    const cutoff = since * 1000;
    return [...this.intents.values()].filter((pi) => new Date(pi.createdAt).getTime() >= cutoff);
  }

  /**
   * Dev-only: flips a mock PI to succeeded and returns the updated snapshot.
   * Callers should then synthesize a `payment_intent.succeeded` webhook
   * event so production and dev share the same activation code path.
   */
  forceSucceed(paymentIntentId: string): PaymentIntentSnapshot {
    const pi = this.intents.get(paymentIntentId);
    if (!pi) throw new Error(`Mock PI ${paymentIntentId} not found`);
    const updated: PaymentIntentSnapshot = {
      ...pi,
      status: 'succeeded',
      succeededAt: new Date().toISOString(),
    };
    this.intents.set(paymentIntentId, updated);
    return updated;
  }
}
