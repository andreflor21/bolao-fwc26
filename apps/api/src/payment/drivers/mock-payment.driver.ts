import { Logger } from '@nestjs/common';
import { randomBytes } from 'node:crypto';
import type {
  CheckoutSession,
  CreateCheckoutSessionInput,
  IPaymentDriver,
  PaymentIntentSnapshot,
  RefundResult,
  WebhookEvent,
} from './payment-driver.interface';

interface MockSessionState {
  session: CheckoutSession;
  userId: string;
  pi: PaymentIntentSnapshot;
}

/**
 * In-memory mock driver for dev / CI. Generates fake Checkout Sessions
 * pointing at a `/pay/mock-success?sid=...` URL the SPA can recognise.
 * Provides `forceSucceed()` to flip a session to `complete` so tests +
 * dev flows run the same activation path as production webhooks.
 */
export class MockPaymentDriver implements IPaymentDriver {
  readonly name = 'mock' as const;
  private readonly logger = new Logger(MockPaymentDriver.name);
  private readonly sessions = new Map<string, MockSessionState>();
  private readonly intents = new Map<string, PaymentIntentSnapshot>();

  async createCheckoutSession(input: CreateCheckoutSessionInput): Promise<CheckoutSession> {
    const sessionId = `mock_cs_${randomBytes(12).toString('hex')}`;
    const piId = `mock_pi_${randomBytes(12).toString('hex')}`;
    const now = new Date();
    const expiresAt = new Date(now.getTime() + 24 * 3600 * 1000);

    const pi: PaymentIntentSnapshot = {
      id: piId,
      status: 'requires_payment_method',
      amountCents: input.amountCents,
      metadata: { userId: input.userId, ...(input.metadata ?? {}) },
      createdAt: now.toISOString(),
      succeededAt: null,
      canceledAt: null,
    };
    this.intents.set(piId, pi);

    const session: CheckoutSession = {
      sessionId,
      // Point at a SPA route the dev frontend can handle.
      url: `${this.deriveOrigin(input.successUrl)}/pay/mock-success?sid=${sessionId}`,
      status: 'open',
      amountCents: input.amountCents,
      expiresAt: expiresAt.toISOString(),
      paymentIntentId: piId,
      metadata: { userId: input.userId, ...(input.metadata ?? {}) },
    };
    this.sessions.set(sessionId, { session, userId: input.userId, pi });
    this.logger.debug(
      `Created mock checkout session ${sessionId} (PI ${piId}) for user ${input.userId} (${input.amountCents}c, methods=${input.methods.join('+')})`,
    );
    return session;
  }

  async retrieveCheckoutSession(sessionId: string): Promise<CheckoutSession> {
    const state = this.sessions.get(sessionId);
    if (!state) throw new Error(`Mock session ${sessionId} not found`);
    return state.session;
  }

  async retrieve(paymentIntentId: string): Promise<PaymentIntentSnapshot> {
    const pi = this.intents.get(paymentIntentId);
    if (!pi) throw new Error(`Mock PI ${paymentIntentId} not found`);
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
      paymentIntentId?: string;
      checkoutSessionId?: string;
    };
    return {
      id: parsed.id,
      type: parsed.type,
      paymentIntent: parsed.paymentIntent ?? null,
      paymentIntentId: parsed.paymentIntentId ?? parsed.paymentIntent?.id ?? null,
      checkoutSessionId: parsed.checkoutSessionId ?? null,
    };
  }

  async listRecentPaymentIntents(since: number): Promise<PaymentIntentSnapshot[]> {
    const cutoff = since * 1000;
    return [...this.intents.values()].filter((pi) => new Date(pi.createdAt).getTime() >= cutoff);
  }

  /**
   * Dev-only: flips a mock checkout session to `complete` and its underlying
   * PI to `succeeded`. Returns the PI snapshot so callers can synthesise a
   * `checkout.session.completed` webhook event identical to what Stripe
   * would deliver in production.
   */
  forceSucceed(sessionId: string): { session: CheckoutSession; pi: PaymentIntentSnapshot } {
    const state = this.sessions.get(sessionId);
    if (!state) throw new Error(`Mock session ${sessionId} not found`);
    const updatedPi: PaymentIntentSnapshot = {
      ...state.pi,
      status: 'succeeded',
      succeededAt: new Date().toISOString(),
    };
    const updatedSession: CheckoutSession = { ...state.session, status: 'complete' };
    this.intents.set(updatedPi.id, updatedPi);
    this.sessions.set(sessionId, { ...state, session: updatedSession, pi: updatedPi });
    return { session: updatedSession, pi: updatedPi };
  }

  private deriveOrigin(url: string): string {
    try {
      const u = new URL(url);
      return u.origin;
    } catch {
      return 'http://localhost:5173';
    }
  }
}
