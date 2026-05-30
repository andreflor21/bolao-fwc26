import { Inject, Injectable, Logger } from '@nestjs/common';
import { Cron } from '@nestjs/schedule';
import type Redis from 'ioredis';
import { PrismaService } from '../prisma/prisma.service';
import { EmailService } from '../email/email.service';
import { RankingService } from './ranking.service';
import { REDIS_CLIENT } from '../redis/redis.tokens';

const TOP10_KEY = 'bolao:ranking:top10';
const TOP_N = 10;

/**
 * Alerta de mudança no top 10 do ranking geral. De hora em hora, calcula o
 * top 10 atual e compara com o snapshot anterior (Redis). Quem ENTROU ou SAIU
 * do top 10 recebe um e-mail. Na primeira execução só grava o baseline (não
 * dispara e-mail pra evitar spam inicial).
 */
@Injectable()
export class RankingAlertCron {
  private readonly logger = new Logger(RankingAlertCron.name);

  constructor(
    private readonly ranking: RankingService,
    private readonly prisma: PrismaService,
    private readonly email: EmailService,
    @Inject(REDIS_CLIENT) private readonly redis: Redis,
  ) {}

  @Cron('0 * * * *', { timeZone: 'America/Sao_Paulo', name: 'ranking-top10-alert' })
  async runHourly(): Promise<void> {
    await this.runOnce();
  }

  /** Entrypoint testável. */
  async runOnce(): Promise<{
    entered: number;
    left: number;
    firstRun: boolean;
  }> {
    // Janela ampla (50) pra também achar a posição de quem caiu do top 10.
    const dto = await this.ranking.getGeneralRanking({ limit: 50 });
    const positionByUser = new Map(dto.rows.map((r) => [r.userId, r.position]));
    const currentTop10 = new Set(
      dto.rows.filter((r) => r.position <= TOP_N).map((r) => r.userId),
    );

    const prevRaw = await this.redis.get(TOP10_KEY);
    await this.redis.set(TOP10_KEY, JSON.stringify([...currentTop10]));

    if (prevRaw === null) {
      this.logger.log('Ranking top10: baseline gravado (primeira execução, sem e-mail)');
      return { entered: 0, left: 0, firstRun: true };
    }

    const prev = new Set<string>(JSON.parse(prevRaw) as string[]);
    const enteredIds = [...currentTop10].filter((id) => !prev.has(id));
    const leftIds = [...prev].filter((id) => !currentTop10.has(id));

    if (enteredIds.length === 0 && leftIds.length === 0) {
      return { entered: 0, left: 0, firstRun: false };
    }

    const users = await this.prisma.user.findMany({
      where: { id: { in: [...enteredIds, ...leftIds] } },
      select: { id: true, name: true, email: true },
    });
    const userById = new Map(users.map((u) => [u.id, u]));

    const notify = async (id: string, entered: boolean): Promise<void> => {
      const u = userById.get(id);
      if (!u) return;
      const position = positionByUser.get(id) ?? TOP_N + 1;
      try {
        await this.email.sendRankingPositionChanged(u.email, u.name, position, entered);
      } catch (e) {
        this.logger.warn(`Falha ao alertar ranking p/ ${u.email}: ${(e as Error).message}`);
      }
    };

    for (const id of enteredIds) await notify(id, true);
    for (const id of leftIds) await notify(id, false);

    this.logger.log(`Ranking top10: entraram=${enteredIds.length}, saíram=${leftIds.length}`);
    return { entered: enteredIds.length, left: leftIds.length, firstRun: false };
  }
}
