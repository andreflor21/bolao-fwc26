import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import webpush, { type PushSubscription } from 'web-push';
import { PrismaService } from '../prisma/prisma.service';

export interface PushPayload {
  title: string;
  body: string;
  /** Path inside the SPA the SW navigates to on notification click. */
  url?: string;
  /** Optional tag — re-using the same tag collapses repeat notifications. */
  tag?: string;
}

export interface BrowserSubscription {
  endpoint: string;
  keys: { p256dh: string; auth: string };
}

@Injectable()
export class PushService {
  private readonly logger = new Logger(PushService.name);
  private readonly enabled: boolean;
  private readonly vapidPublicKey: string | null;

  constructor(
    private readonly prisma: PrismaService,
    config: ConfigService,
  ) {
    const pub = config.get<string>('VAPID_PUBLIC_KEY');
    const priv = config.get<string>('VAPID_PRIVATE_KEY');
    const subject = config.get<string>('VAPID_SUBJECT') ?? 'mailto:admin@bolao.local';
    this.vapidPublicKey = pub ?? null;
    this.enabled = Boolean(pub && priv);
    if (this.enabled) {
      webpush.setVapidDetails(subject, pub!, priv!);
      this.logger.log('Web Push enabled');
    } else {
      this.logger.warn(
        'Web Push DISABLED — set VAPID_PUBLIC_KEY and VAPID_PRIVATE_KEY to enable',
      );
    }
  }

  /** Returned by `GET /push/vapid-public-key` so the SPA can subscribe. */
  getVapidPublicKey(): string | null {
    return this.vapidPublicKey;
  }

  isEnabled(): boolean {
    return this.enabled;
  }

  /**
   * Idempotent: upsert by (userId, endpoint). Re-subscribing from the same
   * browser session just refreshes the auth/p256dh keys (which Push API may
   * rotate periodically).
   */
  async subscribe(
    userId: string,
    sub: BrowserSubscription,
    userAgent: string | null,
  ): Promise<{ id: string; alreadySubscribed: boolean }> {
    const existing = await this.prisma.pushSubscription.findUnique({
      where: { userId_endpoint: { userId, endpoint: sub.endpoint } },
      select: { id: true },
    });
    if (existing) {
      await this.prisma.pushSubscription.update({
        where: { id: existing.id },
        data: {
          keysP256dh: sub.keys.p256dh,
          keysAuth: sub.keys.auth,
          userAgent: userAgent ?? undefined,
        },
      });
      return { id: existing.id, alreadySubscribed: true };
    }
    const row = await this.prisma.pushSubscription.create({
      data: {
        userId,
        endpoint: sub.endpoint,
        keysP256dh: sub.keys.p256dh,
        keysAuth: sub.keys.auth,
        userAgent,
      },
      select: { id: true },
    });
    return { id: row.id, alreadySubscribed: false };
  }

  async unsubscribe(userId: string, endpoint: string): Promise<{ removed: boolean }> {
    const result = await this.prisma.pushSubscription.deleteMany({
      where: { userId, endpoint },
    });
    return { removed: result.count > 0 };
  }

  /**
   * Sends a push notification to every active subscription belonging to the
   * user. Returns the count of successful sends. Subscriptions that the
   * Push service rejects with 404 or 410 (gone/expired) are auto-deleted so
   * the next sweep is faster.
   */
  async sendToUser(userId: string, payload: PushPayload): Promise<{ delivered: number; pruned: number }> {
    if (!this.enabled) {
      this.logger.debug('Push disabled — skipping sendToUser');
      return { delivered: 0, pruned: 0 };
    }
    const subs = await this.prisma.pushSubscription.findMany({ where: { userId } });
    if (subs.length === 0) return { delivered: 0, pruned: 0 };

    let delivered = 0;
    const toPrune: string[] = [];

    await Promise.all(
      subs.map(async (s) => {
        const webpushSub: PushSubscription = {
          endpoint: s.endpoint,
          keys: { p256dh: s.keysP256dh, auth: s.keysAuth },
        };
        try {
          await webpush.sendNotification(webpushSub, JSON.stringify(payload));
          delivered += 1;
        } catch (e) {
          const status = (e as { statusCode?: number }).statusCode;
          if (status === 404 || status === 410) {
            // Endpoint is gone (user unsubscribed at the OS level, browser
            // expired the registration, etc.) — drop it.
            toPrune.push(s.id);
            this.logger.debug(
              `Pruning dead subscription ${s.id} (status=${status}) for user ${userId}`,
            );
          } else {
            this.logger.warn(
              `Push send failed for sub ${s.id} (user ${userId}, status=${status ?? '?'}): ${(e as Error).message}`,
            );
          }
        }
      }),
    );

    if (toPrune.length > 0) {
      await this.prisma.pushSubscription.deleteMany({
        where: { id: { in: toPrune } },
      });
    }
    return { delivered, pruned: toPrune.length };
  }
}
