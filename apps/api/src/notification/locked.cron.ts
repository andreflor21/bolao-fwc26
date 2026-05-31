import { Inject, Injectable, Logger } from '@nestjs/common';
import { Cron } from '@nestjs/schedule';
import type Redis from 'ioredis';
import { PrismaService } from '../prisma/prisma.service';
import { PushService } from './push.service';
import { EmailService } from '../email/email.service';
import { REDIS_CLIENT } from '../redis/redis.tokens';
import { FIFA_WC_2026_ID } from '@bolao/shared';

const LOCKED_SENT_KEY = 'bolao:palpites-locked:sent';
const ONE_MONTH_SECONDS = 30 * 24 * 3600;

/**
 * "Palpites travados": dispara no fechamento da janela (11/06/2026 16:00 BRT,
 * o apito do 1º jogo). Manda e-mail + push para TODOS os subscribers ativos
 * avisando que os palpites travaram e apontando pro ranking.
 *
 * Idempotência via sentinel Redis com TTL longo — re-execução vira no-op.
 */
@Injectable()
export class PalpitesLockedCron {
  private readonly logger = new Logger(PalpitesLockedCron.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly push: PushService,
    private readonly email: EmailService,
    @Inject(REDIS_CLIENT) private readonly redis: Redis,
  ) {}

  // minute hour dayOfMonth month dayOfWeek → 16:00 do dia 11/06 (lock).
  @Cron('0 16 11 6 *', { timeZone: 'America/Sao_Paulo', name: 'palpites-locked' })
  async runAtLock(): Promise<void> {
    await this.runOnce();
  }

  /** Entrypoint testável — o handler @Cron delega aqui. */
  async runOnce(): Promise<{ sent: number; candidates: number; alreadyDispatched: boolean }> {
    const already = await this.redis.get(LOCKED_SENT_KEY);
    if (already) {
      this.logger.debug('Palpites-locked já disparado — skipping');
      return { sent: 0, candidates: 0, alreadyDispatched: true };
    }

    const subs = await this.prisma.subscription.findMany({
      where: { competitionId: FIFA_WC_2026_ID, status: 'active' },
      select: { userId: true, user: { select: { name: true, email: true } } },
    });

    let sent = 0;
    for (const s of subs) {
      const firstName = s.user.name.split(' ')[0];
      try {
        await this.email.sendPalpitesLocked(s.user.email, s.user.name);
        await this.push.sendToUser(s.userId, {
          title: 'Palpites travados! 🔒',
          body: `Boa sorte, ${firstName}! A janela fechou — acompanhe o ranking ao vivo.`,
          url: '/ranking',
          tag: 'palpites-locked',
        });
        sent += 1;
      } catch (e) {
        this.logger.warn(
          `Falha ao notificar lock para ${s.user.email}: ${(e as Error).message}`,
        );
      }
    }

    await this.redis.set(LOCKED_SENT_KEY, new Date().toISOString(), 'EX', ONE_MONTH_SECONDS);
    this.logger.log(`Palpites-locked disparado: candidates=${subs.length}, sent=${sent}`);
    return { sent, candidates: subs.length, alreadyDispatched: false };
  }
}
