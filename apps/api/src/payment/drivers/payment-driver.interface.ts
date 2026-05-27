/**
 * Provider-agnostic payment driver contract.
 * Implementations: MockPaymentDriver (CI/dev), StripePaymentDriver (prod).
 *
 * The driver layer talks in terms of Stripe Checkout Sessions — a hosted
 * checkout page on stripe.com — so we get card/Apple Pay/Boleto/Link/Pix
 * support without writing payment-method-specific UI. The PaymentIntent
 * that ultimately settles the session is exposed when the webhook fires.
 */

export type PaymentIntentStatus =
  | 'requires_payment_method'
  | 'requires_confirmation'
  | 'requires_action'
  | 'processing'
  | 'requires_capture'
  | 'succeeded'
  | 'canceled'
  | 'failed';

export type CheckoutSessionStatus = 'open' | 'complete' | 'expired';

export type PaymentMethodKey = 'card' | 'link' | 'boleto' | 'pix' | 'apple_pay';

export interface CheckoutSession {
  sessionId: string;
  /** Hosted checkout URL the browser should be redirected to. */
  url: string;
  status: CheckoutSessionStatus;
  amountCents: number;
  /** ISO 8601 expiration. Stripe defaults to 24h, mock mirrors it. */
  expiresAt: string;
  /** Populated only once the session has been completed and a PI is attached. */
  paymentIntentId: string | null;
  metadata: Record<string, string>;
}

export interface PaymentIntentSnapshot {
  id: string;
  status: PaymentIntentStatus;
  amountCents: number;
  metadata: Record<string, string>;
  createdAt: string;
  succeededAt: string | null;
  canceledAt: string | null;
}

export interface RefundResult {
  refundId: string;
  paymentIntentId: string;
  amountCents: number;
  createdAt: string;
}

export interface WebhookEvent {
  id: string;
  type: string;
  /**
   * Projected PaymentIntent snapshot when the event payload IS a PaymentIntent
   * (e.g. `payment_intent.succeeded`). Null otherwise.
   */
  paymentIntent: PaymentIntentSnapshot | null;
  /**
   * Stripe PaymentIntent ID for this event regardless of payload shape.
   *   - payment_intent.*   → from paymentIntent.id
   *   - charge.*           → from charge.payment_intent
   *   - refund.*           → from refund.payment_intent
   *   - checkout.session.* → from session.payment_intent
   * Null when the event has no PI association.
   */
  paymentIntentId: string | null;
  /**
   * Stripe Checkout Session ID for checkout.session.* events; null elsewhere.
   */
  checkoutSessionId: string | null;
}

export interface CreateCheckoutSessionInput {
  userId: string;
  amountCents: number;
  /** Description shown to the user on the Stripe-hosted page. */
  description: string;
  successUrl: string;
  cancelUrl: string;
  /** Payment methods to enable for this session (e.g. ['card','link','boleto']). */
  methods: PaymentMethodKey[];
  /** Days the boleto stays open. Ignored when 'boleto' is not in methods. */
  boletoExpiresAfterDays?: number;
  /**
   * Prefills the email on the hosted page. Required for Stripe Link to
   * recognise returning users and offer one-click prefill — without it,
   * Link only appears as "save for next time" on the success page.
   */
  customerEmail?: string;
  metadata?: Record<string, string>;
  /**
   * Stable reference so we can correlate the webhook back to our DB row.
   * Stripe surfaces this in session.client_reference_id.
   */
  clientReferenceId?: string;
}

export interface IPaymentDriver {
  readonly name: 'mock' | 'stripe';

  createCheckoutSession(input: CreateCheckoutSessionInput): Promise<CheckoutSession>;

  retrieveCheckoutSession(sessionId: string): Promise<CheckoutSession>;

  retrieve(paymentIntentId: string): Promise<PaymentIntentSnapshot>;

  refund(paymentIntentId: string): Promise<RefundResult>;

  /**
   * Verify HMAC signature and parse the Stripe-style event envelope.
   * Mock driver may bypass signature verification when configured for dev.
   */
  parseWebhookEvent(rawBody: Buffer, signatureHeader: string | null): WebhookEvent;

  /**
   * List recent payment intents (used by the reconciliation cron).
   * `since` is a Unix timestamp in seconds.
   */
  listRecentPaymentIntents(since: number): Promise<PaymentIntentSnapshot[]>;
}
