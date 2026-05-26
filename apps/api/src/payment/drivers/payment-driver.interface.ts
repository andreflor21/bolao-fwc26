/**
 * Provider-agnostic payment driver contract.
 * Implementations: MockPaymentDriver (CI/dev), StripePaymentDriver (prod).
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

export interface PixDetails {
  /** Copy-and-paste Pix code (BR Code / EMV format) — the long text the user can paste in their bank app. */
  qrCodeText: string;
  /** Public URL to a PNG render of the QR code. Stripe hosts it; mock returns a data URL. */
  qrCodePngUrl: string;
  /** ISO 8601 expiration timestamp. After this, a new PI must be created. */
  expiresAt: string;
}

export interface PixPaymentIntent {
  paymentIntentId: string;
  /** Client secret (Stripe). For Pix flows clients don't usually need it, but we return for parity. */
  clientSecret: string | null;
  status: PaymentIntentStatus;
  amountCents: number;
  pix: PixDetails;
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
   * Stripe-shaped event data envelope. For payment_intent.* events, the object
   * is the underlying PaymentIntent snapshot (provider format) — handlers should
   * call `toSnapshot()` to project it into our shape.
   */
  paymentIntent: PaymentIntentSnapshot | null;
}

export interface CreatePixIntentInput {
  userId: string;
  amountCents: number;
  metadata?: Record<string, string>;
  /** When the PI should expire (Stripe Pix max ~24h). Optional; driver picks default. */
  expiresInSeconds?: number;
}

export interface IPaymentDriver {
  readonly name: 'mock' | 'stripe';

  createPixPaymentIntent(input: CreatePixIntentInput): Promise<PixPaymentIntent>;

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
