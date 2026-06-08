import { Inject, Injectable, Logger } from '@nestjs/common';
import Redis from 'ioredis';
import { PrismaService } from '../prisma/prisma.service';
import { REDIS_CLIENT } from '../redis/redis.tokens';
import {
  FIFA_WC_2026_ID,
  SCORE_RULES,
  type RankingDto,
  type RankingRowDto,
} from '@bolao/shared';

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
    const [scores, knockoutScores] = await Promise.all([
      this.prisma.guessScore.findMany({
        where: { guess: { userId } },
        select: { points: true, ruleApplied: true },
      }),
      this.prisma.knockoutGuessScore.findMany({
        where: { userId },
        select: { points: true, scorePoints: true },
      }),
    ]);

    // Ranking único: pontos da fase de grupos + pontos do mata-mata.
    const groupPoints = scores.reduce((sum, s) => sum + s.points, 0);
    const koPoints = knockoutScores.reduce((sum, s) => sum + s.points, 0);
    const totalPoints = groupPoints + koPoints;
    // Placares certos (cravadas) = exatos da fase de grupos + exatos do mata-mata
    // (no KO, placar exato ⇒ scorePoints == EXACT_SCORE). Usado como desempate.
    const groupExact = scores.filter((s) => s.ruleApplied === 'EXACT_SCORE').length;
    const koExact = knockoutScores.filter(
      (s) => s.scorePoints === SCORE_RULES.EXACT_SCORE,
    ).length;
    const exactCount = groupExact + koExact;

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
    const participantIds = await this.generalParticipantIds();
    return this.zsetToRanking(KEYS.general, 'Geral', opts, participantIds);
  }

  async getSidePoolRanking(
    sidePoolId: string,
    poolName: string,
    opts: { limit: number; userId?: string },
  ): Promise<RankingDto> {
    const participantIds = await this.sidePoolParticipantIds(sidePoolId);
    return this.zsetToRanking(KEYS.side(sidePoolId), poolName, opts, participantIds);
  }

  /** Active subscribers of the competition — the full general-pool roster. */
  private async generalParticipantIds(): Promise<string[]> {
    const subs = await this.prisma.subscription.findMany({
      where: { competitionId: FIFA_WC_2026_ID, status: 'active' },
      select: { userId: true },
    });
    return subs.map((s) => s.userId);
  }

  /** Everyone who joined a given side pool — the full side-pool roster. */
  private async sidePoolParticipantIds(sidePoolId: string): Promise<string[]> {
    const members = await this.prisma.sidePoolMember.findMany({
      where: { sidePoolId },
      select: { userId: true },
    });
    return members.map((m) => m.userId);
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
    participantIds: string[],
  ): Promise<RankingDto> {
    const limit = Math.max(1, Math.min(opts.limit, 1000));

    // Scored users, highest first. We pull the full ZSET (pools are small —
    // see getExactScoreLeader note) so we can merge in participants who have
    // not scored yet and still respect the score ordering.
    const flat = await this.redis.zrevrange(key, 0, -1, 'WITHSCORES');
    const scored: Array<[string, number]> = [];
    const scoredIds = new Set<string>();
    for (let i = 0; i < flat.length; i += 2) {
      const id = flat[i]!;
      scored.push([id, Number(flat[i + 1])]);
      scoredIds.add(id);
    }

    // Participants with no score yet — appended at the bottom with 0 points so
    // everyone enrolled shows up even before any result is registered.
    const unscoredIds = participantIds.filter((id) => !scoredIds.has(id));

    const displayIds = [...scoredIds, ...unscoredIds];
    const [users, exactCounts] = await Promise.all([
      this.prisma.user.findMany({
        where: { id: { in: displayIds } },
        select: { id: true, name: true },
      }),
      displayIds.length
        ? this.redis.mget(...displayIds.map((id) => KEYS.exact(id)))
        : Promise.resolve([] as (string | null)[]),
    ]);
    const userById = new Map(users.map((u) => [u.id, u.name]));
    const exactById = new Map(
      displayIds.map((id, idx) => [id, Number(exactCounts[idx] ?? 0)]),
    );

    // Pontuação por usuário: marcados vêm do ZSET; não-marcados entram com 0.
    const pointsById = new Map<string, number>(scored);

    // Ordenação final com DESEMPATE determinístico:
    //   1) pontos (desc)
    //   2) placares certos / cravadas (desc)
    //   3) nome em ordem alfabética (pt) — usado quando tudo está empatado.
    const allRows: RankingRowDto[] = displayIds
      .map((userId) => ({
        userId,
        name: userById.get(userId) ?? '—',
        points: pointsById.get(userId) ?? 0,
        exactScores: exactById.get(userId) ?? 0,
        isOwn: opts.userId === userId,
      }))
      .sort(
        (a, b) =>
          b.points - a.points ||
          b.exactScores - a.exactScores ||
          a.name.localeCompare(b.name, 'pt'),
      )
      .map((r, idx) => ({ position: idx + 1, ...r }));

    const total = allRows.length;
    const ownRow = opts.userId
      ? allRows.find((r) => r.userId === opts.userId) ?? null
      : null;
    const ownPosition = ownRow?.position ?? null;

    const rows = allRows.slice(0, limit);
    // Keep the viewer visible even when they fall outside the top `limit`.
    if (ownRow && !rows.some((r) => r.userId === ownRow.userId)) {
      rows.push(ownRow);
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
