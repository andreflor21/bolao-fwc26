import { Inject, Injectable, Logger } from '@nestjs/common';
import Redis from 'ioredis';
import { PrismaService } from '../prisma/prisma.service';
import { RankingService } from '../ranking/ranking.service';
import { REDIS_CLIENT } from '../redis/redis.tokens';
import {
  FIFA_WC_2026_ID,
  PRIZE_DISTRIBUTION,
  type PrizeCategory,
  type PrizesViewDto,
} from '@bolao/shared';
import {
  computeBreakdown,
  type ExactScoreUser,
  type RankedUser,
} from '../domain/prize/prize-engine';

const CACHE_KEY = 'bolao:prizes:general';
const CACHE_TTL_SECONDS = 30;

@Injectable()
export class PrizeService {
  private readonly logger = new Logger(PrizeService.name);

  constructor(
    @Inject(REDIS_CLIENT) private readonly redis: Redis,
    private readonly prisma: PrismaService,
    private readonly ranking: RankingService,
  ) {}

  /**
   * Returns the live prizes breakdown. Cached in Redis for 30 s — recomputation
   * after admin actions is best-effort triggered via {@link invalidate}.
   */
  async getPrizesView(): Promise<PrizesViewDto> {
    const cached = await this.redis.get(CACHE_KEY);
    if (cached) {
      try {
        return JSON.parse(cached) as PrizesViewDto;
      } catch {
        // fall through to recompute
      }
    }
    const view = await this.recompute();
    await this.redis.set(CACHE_KEY, JSON.stringify(view), 'EX', CACHE_TTL_SECONDS);
    return view;
  }

  async invalidate(): Promise<void> {
    await this.redis.del(CACHE_KEY);
  }

  private async recompute(): Promise<PrizesViewDto> {
    const competition = await this.prisma.competition.findUnique({
      where: { id: FIFA_WC_2026_ID },
      select: { prizeDistribution: true },
    });
    const distribution = this.readDistribution(competition?.prizeDistribution);

    const [subs, ranking, exactScores] = await Promise.all([
      this.prisma.subscription.count({
        where: { competitionId: FIFA_WC_2026_ID, status: 'active' },
      }),
      this.loadRanking(),
      this.loadExactScores(),
    ]);

    const amountCents = await this.amountCents();
    return computeBreakdown(subs, amountCents, ranking, exactScores, distribution);
  }

  private async amountCents(): Promise<number> {
    const sample = await this.prisma.subscription.findFirst({
      where: { competitionId: FIFA_WC_2026_ID, status: 'active' },
      select: { amountCents: true },
    });
    return sample?.amountCents ?? 5000;
  }

  private async loadRanking(): Promise<RankedUser[]> {
    // Pull all ranked users from the general ZSET (no limit — needed for top-5 + ties).
    const general = await this.ranking.getGeneralRanking({ limit: 1000 });
    return general.rows.map((r) => ({
      userId: r.userId,
      name: r.name,
      points: r.points,
    }));
  }

  private async loadExactScores(): Promise<ExactScoreUser[]> {
    // Walk every active subscriber's exact counter. Cheaper than reading the
    // dedicated key set (we don't maintain one yet).
    const subs = await this.prisma.subscription.findMany({
      where: { competitionId: FIFA_WC_2026_ID, status: 'active' },
      select: { userId: true, user: { select: { name: true } } },
    });
    if (subs.length === 0) return [];
    const counts = await this.redis.mget(
      ...subs.map((s) => `bolao:exact:${s.userId}`),
    );
    return subs.map((s, idx) => ({
      userId: s.userId,
      name: s.user.name,
      exactScores: counts[idx] ? Number(counts[idx]) : 0,
    }));
  }

  private readDistribution(raw: unknown): Record<PrizeCategory, number> {
    if (!raw || typeof raw !== 'object') return PRIZE_DISTRIBUTION;
    const obj = raw as Record<string, number>;
    const aliases: Record<string, PrizeCategory> = {
      '1st': 'first',
      '2nd': 'second',
      '3rd': 'third',
      '4th': 'fourth',
      '5th': 'fifth',
      first: 'first',
      second: 'second',
      third: 'third',
      fourth: 'fourth',
      fifth: 'fifth',
      exact_score_king: 'exact_score_king',
      admin: 'admin',
    };
    const out: Record<PrizeCategory, number> = { ...PRIZE_DISTRIBUTION };
    for (const [k, v] of Object.entries(obj)) {
      const cat = aliases[k];
      if (cat && typeof v === 'number') out[cat] = v;
    }
    return out;
  }
}
