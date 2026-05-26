import { MockPaymentDriver } from './mock-payment.driver';

describe('MockPaymentDriver', () => {
  let driver: MockPaymentDriver;

  beforeEach(() => {
    driver = new MockPaymentDriver();
  });

  function makeSession(opts?: { userId?: string; amountCents?: number }) {
    return driver.createCheckoutSession({
      userId: opts?.userId ?? 'user-1',
      amountCents: opts?.amountCents ?? 5000,
      description: 'Test subscription',
      successUrl: 'http://localhost:5173/pay/success',
      cancelUrl: 'http://localhost:5173/pay/cancel',
      methods: ['card', 'link', 'boleto'],
      boletoExpiresAfterDays: 3,
      metadata: { competitionId: 'fifa-wc-2026' },
    });
  }

  describe('createCheckoutSession', () => {
    it('creates a session in `open` status with mock URL', async () => {
      const s = await makeSession();
      expect(s.sessionId).toMatch(/^mock_cs_/);
      expect(s.paymentIntentId).toMatch(/^mock_pi_/);
      expect(s.amountCents).toBe(5000);
      expect(s.status).toBe('open');
      expect(s.url).toContain('/pay/mock-success?sid=');
      expect(new Date(s.expiresAt).getTime()).toBeGreaterThan(Date.now());
      expect(s.metadata.userId).toBe('user-1');
      expect(s.metadata.competitionId).toBe('fifa-wc-2026');
    });

    it('honours the success URL origin so the mock redirect stays on the SPA', async () => {
      const s = await driver.createCheckoutSession({
        userId: 'u',
        amountCents: 1000,
        description: 'x',
        successUrl: 'https://bolao.app/pay/success',
        cancelUrl: 'https://bolao.app/pay/cancel',
        methods: ['card'],
      });
      expect(s.url.startsWith('https://bolao.app/')).toBe(true);
    });
  });

  describe('retrieveCheckoutSession + retrieve', () => {
    it('retrieves the session and its PI', async () => {
      const s = await makeSession();
      const reloaded = await driver.retrieveCheckoutSession(s.sessionId);
      expect(reloaded.sessionId).toBe(s.sessionId);
      const pi = await driver.retrieve(s.paymentIntentId!);
      expect(pi.id).toBe(s.paymentIntentId);
      expect(pi.status).toBe('requires_payment_method');
    });

    it('throws on unknown id', async () => {
      await expect(driver.retrieve('mock_pi_unknown')).rejects.toThrow(/not found/);
      await expect(driver.retrieveCheckoutSession('mock_cs_unknown')).rejects.toThrow(/not found/);
    });
  });

  describe('forceSucceed', () => {
    it('flips a session to complete and its PI to succeeded', async () => {
      const s = await makeSession();
      const { session, pi } = driver.forceSucceed(s.sessionId);
      expect(session.status).toBe('complete');
      expect(pi.status).toBe('succeeded');
      expect(pi.succeededAt).not.toBeNull();
      const reloaded = await driver.retrieve(s.paymentIntentId!);
      expect(reloaded.status).toBe('succeeded');
    });

    it('throws on unknown session', () => {
      expect(() => driver.forceSucceed('mock_cs_ghost')).toThrow(/not found/);
    });
  });

  describe('refund', () => {
    it('refunds a succeeded PI and returns matching amount', async () => {
      const s = await makeSession();
      driver.forceSucceed(s.sessionId);
      const refund = await driver.refund(s.paymentIntentId!);
      expect(refund.amountCents).toBe(5000);
      expect(refund.refundId).toMatch(/^mock_re_/);
      expect(refund.paymentIntentId).toBe(s.paymentIntentId);
    });

    it('rejects refund on non-succeeded PI', async () => {
      const s = await makeSession();
      await expect(driver.refund(s.paymentIntentId!)).rejects.toThrow(/in status/);
    });
  });

  describe('parseWebhookEvent', () => {
    it('parses a JSON envelope without signature (PI event)', () => {
      const body = Buffer.from(
        JSON.stringify({
          id: 'evt_123',
          type: 'payment_intent.succeeded',
          paymentIntent: {
            id: 'mock_pi_x',
            status: 'succeeded',
            amountCents: 5000,
            metadata: {},
            createdAt: new Date().toISOString(),
            succeededAt: new Date().toISOString(),
            canceledAt: null,
          },
        }),
      );
      const event = driver.parseWebhookEvent(body, null);
      expect(event.id).toBe('evt_123');
      expect(event.type).toBe('payment_intent.succeeded');
      expect(event.paymentIntent?.id).toBe('mock_pi_x');
      expect(event.paymentIntentId).toBe('mock_pi_x');
      expect(event.checkoutSessionId).toBeNull();
    });

    it('parses a checkout.session.completed envelope with session id', () => {
      const body = Buffer.from(
        JSON.stringify({
          id: 'evt_cs1',
          type: 'checkout.session.completed',
          checkoutSessionId: 'mock_cs_abc',
          paymentIntentId: 'mock_pi_abc',
        }),
      );
      const event = driver.parseWebhookEvent(body, null);
      expect(event.type).toBe('checkout.session.completed');
      expect(event.checkoutSessionId).toBe('mock_cs_abc');
      expect(event.paymentIntentId).toBe('mock_pi_abc');
    });
  });

  describe('listRecentPaymentIntents', () => {
    it('filters by created since cutoff', async () => {
      const s1 = await makeSession({ amountCents: 100 });
      const s2 = await makeSession({ amountCents: 200 });
      const all = await driver.listRecentPaymentIntents(0);
      expect(all.map((p) => p.id).sort()).toEqual(
        [s1.paymentIntentId!, s2.paymentIntentId!].sort(),
      );

      const future = Math.floor(Date.now() / 1000) + 60;
      const none = await driver.listRecentPaymentIntents(future);
      expect(none).toEqual([]);
    });
  });
});
