import { Inject, Injectable, Logger } from '@nestjs/common';
import { Cron } from '@nestjs/schedule';
import type Redis from 'ioredis';
import { PrismaService } from '../prisma/prisma.service';
import { PushService } from './push.service';
import { REDIS_CLIENT } from '../redis/redis.tokens';
import { FIFA_WC_2026_ID } from '@bolao/shared';

const D1_SENT_KEY = 'bolao:reminder-d1:sent';
const ONE_MONTH_SECONDS = 30 * 24 * 3600;

/**
 * Reminder D-1: 24h antes do apito do 1º jogo da Copa, varre os subscribers
 * ativos que ainda não submeteram palpites de grupo e dispara um push.
 *
 * Disparo: 10/06/2026 às 15:55 BRT (apito é 11/06 16:00 BRT, então 24h - 5min).
 * O 5min de folga existe pra dar tempo de algumas notificações chegarem antes
 * do banner de "palpites travados" aparecer no app.
 *
 * Idempotência: gravamos um sentinel no Redis com TTL longo após executar.
 * Re-execução no mesmo dia (ex: restart da API + cron disparando de novo)
 * vira no-op.
 */
@Injectable()
export class ReminderCron {
  private readonly logger = new Logger(ReminderCron.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly push: PushService,
    @Inject(REDIS_CLIENT) private readonly redis: Redis,
  ) {}

  // Cron: minute hour dayOfMonth month dayOfWeek → 15:55 do dia 10/06.
  @Cron('55 15 10 6 *', {
    timeZone: 'America/Sao_Paulo',
    name: 'reminder-d1-group',
  })
  async runD1(): Promise<void> {
    await this.runOnce();
  }

  /**
   * Public entrypoint kept testable: the @Cron handler delegates here, and
   * the spec calls it directly without waiting for the schedule fire.
   */
  async runOnce(): Promise<{
    sent: number;
    skipped: number;
    candidates: number;
    alreadyDispatched: boolean;
  }> {
    const already = await this.redis.get(D1_SENT_KEY);
    if (already) {
      this.logger.debug('Reminder D-1 already dispatched — skipping');
      return { sent: 0, skipped: 0, candidates: 0, alreadyDispatched: true };
    }

    const candidates = await this.findPendingSubscribers();
    if (candidates.length === 0) {
      await this.markDispatched();
      return { sent: 0, skipped: 0, candidates: 0, alreadyDispatched: false };
    }

    let sent = 0;
    let skipped = 0;
    for (const c of candidates) {
      const result = await this.push.sendToUser(c.userId, {
        title: 'Faltam 24h — palpites fechando!',
        body: `Olá, ${c.name.split(' ')[0]}! Você ainda não submeteu seus palpites de grupo. A janela fecha amanhã às 16h. 🟢⚽`,
        url: '/guesses',
        tag: 'reminder-d1',
      });
      if (result.delivered > 0) sent += 1;
      else skipped += 1;
    }

    await this.markDispatched();
    this.logger.log(
      `Reminder D-1 dispatched: candidates=${candidates.length}, sent=${sent}, skipped=${skipped}`,
    );
    return { sent, skipped, candidates: candidates.length, alreadyDispatched: false };
  }

  /**
   * Subscribers ativos cuja submission de grupo ainda não foi finalizada.
   * Critério: subscription.status='active' E nenhum guess deles tem
   * submittedAt setado (basta um pra contar como submetido — `submit()` seta
   * todos atomicamente).
   */
  private async findPendingSubscribers(): Promise<Array<{ userId: string; name: string }>> {
    const subs = await this.prisma.subscription.findMany({
      where: {
        competitionId: FIFA_WC_2026_ID,
        status: 'active',
        user: {
          guesses: {
            none: { submittedAt: { not: null } },
          },
        },
      },
      select: { userId: true, user: { select: { name: true } } },
    });
    return subs.map((s) => ({ userId: s.userId, name: s.user.name }));
  }

  private async markDispatched(): Promise<void> {
    await this.redis.set(D1_SENT_KEY, new Date().toISOString(), 'EX', ONE_MONTH_SECONDS);
  }
}
