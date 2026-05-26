import { Inject, Injectable, Logger } from '@nestjs/common';
import Redis from 'ioredis';
import { PrismaService } from '../prisma/prisma.service';
import { REDIS_CLIENT } from '../redis/redis.tokens';
import { FIFA_WC_2026_ID, type RankingDto, type RankingRowDto } from '@bolao/shared';

const KEYS = {
  general: 'bolao:ranking:general',
  side: (sidePoolId: string) => `bolao:ranking:side:${sidePoolId}`,
  exact: (userId: string) => `bolao:exact:${userId}`,
};

@Injectable()
export class RankingService {
  private readonly logger = new Logger(RankingService.name);

  constructor(
    @Inject(REDIS_CLIENT) private readonly redis: Redis,
    private readonly prisma: PrismaService,
  ) {}

  /**
   * Recomputes ranking and exact-score counters for all users with an active
   * subscription. Idempotent: stores absolute values. Used by admin endpoint
   * "Recompute everything" and initial seed.
   */
  async recomputeAll(): Promise<{ users: number }> {
    const subs = await this.prisma.subscription.findMany({
      where: { competitionId: FIFA_WC_2026_ID, status: 'active' },
      select: { userId: true },
    });
    const pipeline = this.redis.pipeline();
    pipeline.del(KEYS.general);
    const sidePoolIds = await this.collectSidePoolIds();
    for (const id of sidePoolIds) pipeline.del(KEYS.side(id));
    for (const sub of subs) pipeline.del(KEYS.exact(sub.userId));
    await pipeline.exec();

    for (const sub of subs) {
      await this.recomputeForUser(sub.userId);
    }
    return { users: subs.length };
  }

  /**
   * Recomputes a single user's totals. Sums points + exact-score counts
   * from `guess_scores` and writes absolute values to all ZSETs the user
   * belongs to. Idempotent.
   */
  async recomputeForUser(userId: string): Promise<void> {
    const scores = await this.prisma.guessScore.findMany({
      where: { guess: { userId } },
      select: { points: true, ruleApplied: true },
    });

    const totalPoints = scores.reduce((sum, s) => sum + s.points, 0);
    const exactCount = scores.filter((s) => s.ruleApplied === 'EXACT_SCORE').length;

    const memberships = await this.prisma.sidePoolMember.findMany({
      where: { userId },
      select: { sidePoolId: true },
    });

    const pipeline = this.redis.pipeline();
    pipeline.zadd(KEYS.general, totalPoints, userId);
    for (const m of memberships) {
      pipeline.zadd(KEYS.side(m.sidePoolId), totalPoints, userId);
    }
    pipeline.set(KEYS.exact(userId), exactCount);
    await pipeline.exec();
  }

  /**
   * Recomputes everyone who guessed on a specific match. Called after admin
   * registers an official result.
   */
  async recomputeForMatch(matchId: string): Promise<{ users: number }> {
    const userRows = await this.prisma.guess.findMany({
      where: { matchId },
      select: { userId: true },
      distinct: ['userId'],
    });
    for (const row of userRows) {
      await this.recomputeForUser(row.userId);
    }
    return { users: userRows.length };
  }

  async getGeneralRanking(opts: { limit: number; userId?: string }): Promise<RankingDto> {
    return this.zsetToRanking(KEYS.general, 'Geral', opts);
  }

  async getSidePoolRanking(
    sidePoolId: string,
    poolName: string,
    opts: { limit: number; userId?: string },
  ): Promise<RankingDto> {
    return this.zsetToRanking(KEYS.side(sidePoolId), poolName, opts);
  }

  async getExactScoreLeader(): Promise<{ userId: string; count: number; name: string } | null> {
    // Stats counters can be many; for the leader we'd ideally maintain a
    // dedicated ZSET. For Sprint 3 we sweep — fine until N>10k subscribers.
    const subs = await this.prisma.subscription.findMany({
      where: { competitionId: FIFA_WC_2026_ID, status: 'active' },
      select: { userId: true },
    });
    if (subs.length === 0) return null;
    const keys = subs.map((s) => KEYS.exact(s.userId));
    const counts = await this.redis.mget(...keys);
    let best: { userId: string; count: number } | null = null;
    counts.forEach((c, idx) => {
      const count = c ? Number(c) : 0;
      if (count === 0) return;
      if (!best || count > best.count) {
        best = { userId: subs[idx]!.userId, count };
      }
    });
    if (!best) return null;
    const leader = best as { userId: string; count: number };
    const user = await this.prisma.user.findUnique({
      where: { id: leader.userId },
      select: { name: true },
    });
    return { userId: leader.userId, count: leader.count, name: user?.name ?? '—' };
  }

  private async zsetToRanking(
    key: string,
    poolName: string,
    opts: { limit: number; userId?: string },
  ): Promise<RankingDto> {
    const limit = Math.max(1, Math.min(opts.limit, 1000));
    const flat = await this.redis.zrevrange(key, 0, limit - 1, 'WITHSCORES');
    const pairs: Array<[string, number]> = [];
    for (let i = 0; i < flat.length; i += 2) {
      pairs.push([flat[i]!, Number(flat[i + 1])]);
    }
    const userIds = pairs.map((p) => p[0]);
    const includeOwn = opts.userId && !userIds.includes(opts.userId);
    if (includeOwn && opts.userId) userIds.push(opts.userId);

    const [users, total] = await Promise.all([
      this.prisma.user.findMany({
        where: { id: { in: userIds } },
        select: { id: true, name: true },
      }),
      this.redis.zcard(key),
    ]);
    const userById = new Map(users.map((u) => [u.id, u.name]));
    const exactCounts = userIds.length
      ? await this.redis.mget(...userIds.map((id) => KEYS.exact(id)))
      : [];
    const exactById = new Map(
      userIds.map((id, idx) => [id, Number(exactCounts[idx] ?? 0)]),
    );

    const rows: RankingRowDto[] = pairs.map(([userId, points], idx) => ({
      position: idx + 1,
      userId,
      name: userById.get(userId) ?? '—',
      points,
      exactScores: exactById.get(userId) ?? 0,
      isOwn: opts.userId === userId,
    }));

    let ownPosition: number | null = null;
    if (opts.userId) {
      const rank = await this.redis.zrevrank(key, opts.userId);
      ownPosition = rank === null ? null : rank + 1;
      if (includeOwn && ownPosition !== null) {
        const ownScore = await this.redis.zscore(key, opts.userId);
        rows.push({
          position: ownPosition,
          userId: opts.userId,
          name: userById.get(opts.userId) ?? '—',
          points: ownScore ? Number(ownScore) : 0,
          exactScores: exactById.get(opts.userId) ?? 0,
          isOwn: true,
        });
      }
    }

    return { rows, ownPosition, total, poolName };
  }

  private async collectSidePoolIds(): Promise<string[]> {
    const sps = await this.prisma.sidePool.findMany({
      where: { competitionId: FIFA_WC_2026_ID },
      select: { id: true },
    });
    return sps.map((sp) => sp.id);
  }
}
