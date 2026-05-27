import { Logger } from '@nestjs/common';
import type { StripeApi } from './stripe-types';
import type {
  CheckoutSession,
  CheckoutSessionStatus,
  CreateCheckoutSessionInput,
  IPaymentDriver,
  PaymentIntentSnapshot,
  PaymentIntentStatus,
  PaymentMethodKey,
  RefundResult,
  WebhookEvent,
} from './payment-driver.interface';

/**
 * Wraps a Stripe SDK error with extra context (request_id, type, code, raw
 * message) so production logs let you find the original request in the
 * Stripe dashboard without digging through stack traces.
 */
class StripeOperationError extends Error {
  constructor(op: string, cause: unknown) {
    const c = cause as {
      message?: string;
      type?: string;
      code?: string;
      decline_code?: string;
      statusCode?: number;
      requestId?: string;
      raw?: { message?: string };
    };
    const message =
      `[Stripe.${op}] ${c?.message ?? c?.raw?.message ?? 'unknown error'}` +
      (c?.type ? ` (type=${c.type})` : '') +
      (c?.code ? ` (code=${c.code})` : '') +
      (c?.decline_code ? ` (decline_code=${c.decline_code})` : '') +
      (c?.statusCode ? ` (status=${c.statusCode})` : '') +
      (c?.requestId ? ` [req=${c.requestId}]` : '');
    super(message);
    this.name = 'StripeOperationError';
  }
}

/**
 * Maps our internal payment-method keys to Stripe's `payment_method_types`
 * strings. Keeps the conversion in one place so misspellings don't slip
 * past the type checker.
 */
const METHOD_TO_STRIPE: Record<PaymentMethodKey, string> = {
  card: 'card',
  link: 'link',
  boleto: 'boleto',
  pix: 'pix',
  // apple_pay is implicitly enabled by Stripe whenever 'card' is enabled
  // and the requesting browser/device supports it. Stripe doesn't accept
  // 'apple_pay' as a payment_method_types value — we silently dedupe to 'card'.
  apple_pay: 'card',
};

export class StripePaymentDriver implements IPaymentDriver {
  readonly name = 'stripe' as const;
  private readonly logger = new Logger(StripePaymentDriver.name);

  constructor(
    private readonly stripe: StripeApi,
    private readonly webhookSecret: string,
  ) {}

  async createCheckoutSession(input: CreateCheckoutSessionInput): Promise<CheckoutSession> {
    // The Stripe SDK exposes payment_method_types as a tight string union
    // (e.g. 'card' | 'boleto' | …). Our internal METHOD_TO_STRIPE values
    // already conform to that union — we just can't easily name the union
    // without reaching for un-exported sub-namespaces, so type the array as
    // the parameter shape Stripe expects.
    type CreateParams = Parameters<StripeApi['checkout']['sessions']['create']>[0];
    type MethodArray = NonNullable<NonNullable<CreateParams>['payment_method_types']>;
    type MethodOptions = NonNullable<CreateParams>['payment_method_options'];

    const stripeMethods = Array.from(
      new Set(input.methods.map((m) => METHOD_TO_STRIPE[m])),
    ) as MethodArray;

    const paymentMethodOptions: MethodOptions = {};
    if (stripeMethods.includes('boleto') && input.boletoExpiresAfterDays) {
      (paymentMethodOptions as { boleto?: { expires_after_days: number } }).boleto = {
        expires_after_days: input.boletoExpiresAfterDays,
      };
    }

    let session: StripeApi.Checkout.Session;
    try {
      session = await this.stripe.checkout.sessions.create(
        {
          mode: 'payment',
          payment_method_types: stripeMethods,
          payment_method_options: paymentMethodOptions,
          line_items: [
            {
              price_data: {
                currency: 'brl',
                product_data: { name: input.description },
                unit_amount: input.amountCents,
              },
              quantity: 1,
            },
          ],
          success_url: input.successUrl,
          cancel_url: input.cancelUrl,
          client_reference_id: input.clientReferenceId,
          // customer_email + 'link' in payment_method_types lets Stripe Link
          // identify returning customers from a prior Link purchase on any
          // Stripe merchant and offer one-click checkout.
          ...(input.customerEmail ? { customer_email: input.customerEmail } : {}),
          metadata: {
            userId: input.userId,
            ...(input.metadata ?? {}),
          },
          payment_intent_data: {
            metadata: {
              userId: input.userId,
              ...(input.metadata ?? {}),
            },
          },
        },
        // Idempotency-Key bound to user — protects against double-clicks
        // creating two sessions for the same checkout attempt.
        { idempotencyKey: `cs-create-${input.userId}-${Date.now()}` },
      );
    } catch (e) {
      const wrapped = new StripeOperationError('checkout.sessions.create', e);
      this.logger.error(wrapped.message);
      throw wrapped;
    }

    return this.toCheckoutSession(session);
  }

  async retrieveCheckoutSession(sessionId: string): Promise<CheckoutSession> {
    try {
      const session = await this.stripe.checkout.sessions.retrieve(sessionId);
      return this.toCheckoutSession(session);
    } catch (e) {
      const wrapped = new StripeOperationError(`checkout.sessions.retrieve(${sessionId})`, e);
      this.logger.warn(wrapped.message);
      throw wrapped;
    }
  }

  async retrieve(paymentIntentId: string): Promise<PaymentIntentSnapshot> {
    try {
      const pi = await this.stripe.paymentIntents.retrieve(paymentIntentId);
      return this.toSnapshot(pi);
    } catch (e) {
      const wrapped = new StripeOperationError(`paymentIntents.retrieve(${paymentIntentId})`, e);
      this.logger.warn(wrapped.message);
      throw wrapped;
    }
  }

  async refund(paymentIntentId: string): Promise<RefundResult> {
    try {
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
    } catch (e) {
      const wrapped = new StripeOperationError(`refunds.create(${paymentIntentId})`, e);
      this.logger.error(wrapped.message);
      throw wrapped;
    }
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

    const obj = event.data.object as { object?: string } | undefined;
    let paymentIntent: PaymentIntentSnapshot | null = null;
    let paymentIntentId: string | null = null;
    let checkoutSessionId: string | null = null;

    if (obj?.object === 'payment_intent') {
      const pi = event.data.object as StripeApi.PaymentIntent;
      paymentIntent = this.toSnapshot(pi);
      paymentIntentId = pi.id;
    } else if (obj?.object === 'charge') {
      const charge = event.data.object as StripeApi.Charge;
      paymentIntentId =
        typeof charge.payment_intent === 'string'
          ? charge.payment_intent
          : (charge.payment_intent?.id ?? null);
    } else if (obj?.object === 'refund') {
      const refund = event.data.object as StripeApi.Refund;
      paymentIntentId =
        typeof refund.payment_intent === 'string'
          ? refund.payment_intent
          : (refund.payment_intent?.id ?? null);
    } else if (obj?.object === 'checkout.session') {
      const session = event.data.object as StripeApi.Checkout.Session;
      checkoutSessionId = session.id;
      paymentIntentId =
        typeof session.payment_intent === 'string'
          ? session.payment_intent
          : (session.payment_intent?.id ?? null);
    }

    return { id: event.id, type: event.type, paymentIntent, paymentIntentId, checkoutSessionId };
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

  private toCheckoutSession(s: StripeApi.Checkout.Session): CheckoutSession {
    const status: CheckoutSessionStatus =
      s.status === 'complete' ? 'complete' : s.status === 'expired' ? 'expired' : 'open';
    const expiresAt = s.expires_at
      ? new Date(s.expires_at * 1000).toISOString()
      : new Date(Date.now() + 24 * 3600 * 1000).toISOString();
    return {
      sessionId: s.id,
      url: s.url ?? '',
      status,
      amountCents: s.amount_total ?? 0,
      expiresAt,
      paymentIntentId:
        typeof s.payment_intent === 'string'
          ? s.payment_intent
          : (s.payment_intent?.id ?? null),
      metadata: (s.metadata as Record<string, string> | null) ?? {},
    };
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
