import { MockPaymentDriver } from './mock-payment.driver';

describe('MockPaymentDriver', () => {
  let driver: MockPaymentDriver;

  beforeEach(() => {
    driver = new MockPaymentDriver();
  });

  describe('createPixPaymentIntent', () => {
    it('creates a PI in requires_payment_method status with QR fields', async () => {
      const pi = await driver.createPixPaymentIntent({
        userId: 'user-1',
        amountCents: 5000,
        metadata: { competitionId: 'fifa-wc-2026' },
      });

      expect(pi.paymentIntentId).toMatch(/^mock_pi_/);
      expect(pi.amountCents).toBe(5000);
      expect(pi.status).toBe('requires_payment_method');
      expect(pi.pix.qrCodeText).toContain('BR.GOV.BCB.PIX');
      expect(pi.pix.qrCodePngUrl).toMatch(/^data:image\/png;base64,/);
      expect(new Date(pi.pix.expiresAt).getTime()).toBeGreaterThan(Date.now());
      expect(pi.metadata.competitionId).toBe('fifa-wc-2026');
    });

    it('honours custom expiresInSeconds', async () => {
      const pi = await driver.createPixPaymentIntent({
        userId: 'user-1',
        amountCents: 5000,
        expiresInSeconds: 60,
      });
      const ttl = new Date(pi.pix.expiresAt).getTime() - Date.now();
      expect(ttl).toBeLessThanOrEqual(60_000 + 100);
      expect(ttl).toBeGreaterThan(50_000);
    });
  });

  describe('retrieve', () => {
    it('returns the stored snapshot', async () => {
      const created = await driver.createPixPaymentIntent({
        userId: 'user-1',
        amountCents: 5000,
      });
      const snap = await driver.retrieve(created.paymentIntentId);
      expect(snap.id).toBe(created.paymentIntentId);
      expect(snap.status).toBe('requires_payment_method');
    });

    it('throws on unknown id', async () => {
      await expect(driver.retrieve('mock_pi_unknown')).rejects.toThrow(/not found/);
    });
  });

  describe('forceSucceed', () => {
    it('flips a pending PI to succeeded and records succeededAt', async () => {
      const created = await driver.createPixPaymentIntent({
        userId: 'user-1',
        amountCents: 5000,
      });
      const succeeded = driver.forceSucceed(created.paymentIntentId);
      expect(succeeded.status).toBe('succeeded');
      expect(succeeded.succeededAt).not.toBeNull();
      const reloaded = await driver.retrieve(created.paymentIntentId);
      expect(reloaded.status).toBe('succeeded');
    });

    it('throws on unknown PI', () => {
      expect(() => driver.forceSucceed('mock_pi_ghost')).toThrow(/not found/);
    });
  });

  describe('refund', () => {
    it('refunds a succeeded PI and returns matching amount', async () => {
      const created = await driver.createPixPaymentIntent({
        userId: 'u',
        amountCents: 5000,
      });
      driver.forceSucceed(created.paymentIntentId);
      const refund = await driver.refund(created.paymentIntentId);
      expect(refund.amountCents).toBe(5000);
      expect(refund.refundId).toMatch(/^mock_re_/);
      expect(refund.paymentIntentId).toBe(created.paymentIntentId);
    });

    it('rejects refund on non-succeeded PI', async () => {
      const created = await driver.createPixPaymentIntent({
        userId: 'u',
        amountCents: 5000,
      });
      await expect(driver.refund(created.paymentIntentId)).rejects.toThrow(/in status/);
    });
  });

  describe('parseWebhookEvent', () => {
    it('parses a JSON envelope without signature', () => {
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
    });
  });

  describe('listRecentPaymentIntents', () => {
    it('filters by created since cutoff', async () => {
      const pi1 = await driver.createPixPaymentIntent({ userId: 'u', amountCents: 100 });
      const pi2 = await driver.createPixPaymentIntent({ userId: 'u', amountCents: 200 });
      const all = await driver.listRecentPaymentIntents(0);
      expect(all.map((p) => p.id).sort()).toEqual([pi1.paymentIntentId, pi2.paymentIntentId].sort());

      const future = Math.floor(Date.now() / 1000) + 60;
      const none = await driver.listRecentPaymentIntents(future);
      expect(none).toEqual([]);
    });
  });
});
