import {
  BadRequestException,
  ConflictException,
  Inject,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { stringify as csvStringify } from 'csv-stringify/sync';
import type Redis from 'ioredis';
import { PrismaService } from '../prisma/prisma.service';
import { RankingService } from '../ranking/ranking.service';
import { PrizeService } from '../prize/prize.service';
import { EmailService } from '../email/email.service';
import { REDIS_CLIENT } from '../redis/redis.tokens';
import {
  FIFA_WC_2026_ID,
  GROUP_STAGE_MATCH_COUNT,
  KNOCKOUT_STAGE_FIXTURE_COUNT,
  PRIZE_DISTRIBUTION,
  PRIZE_LABELS,
  type AdminPrizePayoutDto,
  type ClosurePrecheckDto,
  type ClosureSnapshotDto,
  type FinalPrizePayoutDto,
  type PrizeCategory,
} from '@bolao/shared';
import {
  finalize as finalizePayouts,
  type ExactScoreUser,
  type RankedUser,
} from '../domain/prize/prize-engine';
import type { FinalizeClosureBody } from './dto/finalize.dto';

const CATEGORY_DISPLAY_POSITION: Record<PrizeCategory, number> = {
  first: 1,
  second: 2,
  third: 3,
  fourth: 4,
  fifth: 5,
  exact_score_king: 6,
  admin: 7,
};

@Injectable()
export class AdminClosureService {
  private readonly logger = new Logger(AdminClosureService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly ranking: RankingService,
    private readonly prize: PrizeService,
    private readonly email: EmailService,
    @Inject(REDIS_CLIENT) private readonly redis: Redis,
  ) {}

  /**
   * Pre-flight: tells the operator whether the competition is ready to
   * finalize. Used by the /admin/closure page to enable/disable the
   * "Encerrar competição" button.
   */
  async precheck(): Promise<ClosurePrecheckDto> {
    const competition = await this.prisma.competition.findUnique({
      where: { id: FIFA_WC_2026_ID },
      select: { id: true, closureStatus: true },
    });
    if (!competition) throw new NotFoundException('Competition not initialized — run seed');

    const [groupTotal, groupWithResult, knockoutTotal, knockoutWithResult, subs, sample] =
      await Promise.all([
        this.prisma.match.count({
          where: { competitionId: FIFA_WC_2026_ID, stage: 'group' },
        }),
        this.prisma.match.count({
          where: {
            competitionId: FIFA_WC_2026_ID,
            stage: 'group',
            homeGoalsOfficial: { not: null },
            awayGoalsOfficial: { not: null },
          },
        }),
        this.prisma.match.count({
          where: { competitionId: FIFA_WC_2026_ID, stage: { not: 'group' } },
        }),
        this.prisma.match.count({
          where: {
            competitionId: FIFA_WC_2026_ID,
            stage: { not: 'group' },
            homeGoalsOfficial: { not: null },
            awayGoalsOfficial: { not: null },
          },
        }),
        this.prisma.subscription.count({
          where: { competitionId: FIFA_WC_2026_ID, status: 'active' },
        }),
        this.prisma.subscription.findFirst({
          where: { competitionId: FIFA_WC_2026_ID, status: 'active' },
          select: { amountCents: true },
        }),
      ]);

    const amountCents = sample?.amountCents ?? 5000;

    return {
      competitionId: competition.id,
      closureStatus: competition.closureStatus,
      groupMatchesTotal: groupTotal,
      groupMatchesWithResult: groupWithResult,
      knockoutMatchesTotal: knockoutTotal,
      knockoutMatchesWithResult: knockoutWithResult,
      groupComplete: groupTotal === GROUP_STAGE_MATCH_COUNT && groupWithResult === groupTotal,
      knockoutComplete:
        knockoutTotal === KNOCKOUT_STAGE_FIXTURE_COUNT &&
        knockoutWithResult === knockoutTotal,
      totalSubscribers: subs,
      poolTotalCents: subs * amountCents,
    };
  }

  /**
   * Finalises the competition: validates pre-conditions, computes the
   * final payouts off the current ranking, persists them and locks the
   * competition to `finalized`. Idempotent — re-running on an already
   * finalised competition returns the stored snapshot without touching
   * payouts (the snapshot is the source of truth from that moment on).
   */
  async finalize(body: FinalizeClosureBody): Promise<ClosureSnapshotDto> {
    const competition = await this.prisma.competition.findUnique({
      where: { id: FIFA_WC_2026_ID },
      select: {
        id: true,
        closureStatus: true,
        prizeDistribution: true,
      },
    });
    if (!competition) throw new NotFoundException('Competition not initialized — run seed');

    // Idempotency: if already finalised, return existing snapshot.
    if (competition.closureStatus === 'finalized') {
      return this.buildSnapshot();
    }

    const pre = await this.precheck();
    if (!pre.groupComplete) {
      throw new BadRequestException({
        code: 'GROUP_STAGE_INCOMPLETE',
        message: `Cannot finalize: ${pre.groupMatchesWithResult}/${pre.groupMatchesTotal} group-stage matches have an official result.`,
        groupMatchesTotal: pre.groupMatchesTotal,
        groupMatchesWithResult: pre.groupMatchesWithResult,
      });
    }
    if (!pre.knockoutComplete && !body.confirmIncompleteKnockouts) {
      throw new BadRequestException({
        code: 'KNOCKOUT_INCOMPLETE',
        message: `Knockout stage incomplete: ${pre.knockoutMatchesWithResult}/${pre.knockoutMatchesTotal}. Pass confirmIncompleteKnockouts=true to proceed anyway.`,
        knockoutMatchesTotal: pre.knockoutMatchesTotal,
        knockoutMatchesWithResult: pre.knockoutMatchesWithResult,
      });
    }

    const distribution = this.readDistribution(competition.prizeDistribution);
    const amountCents = await this.amountCents();
    const totalSubscribers = pre.totalSubscribers;

    const [ranking, exactScores] = await Promise.all([
      this.loadRanking(),
      this.loadExactScores(),
    ]);

    const payouts = finalizePayouts(
      totalSubscribers,
      amountCents,
      ranking,
      exactScores,
      distribution,
    );

    await this.persistFinalization(payouts);
    await this.prize.invalidate();

    this.logger.log(
      `Competition ${FIFA_WC_2026_ID} finalised: ${payouts.length} payouts, total ${payouts.reduce(
        (a, p) => a + p.amountCents,
        0,
      )}c distributed.`,
    );

    const snapshot = await this.buildSnapshot();
    // E-mail "você foi premiado" — best-effort: falha de e-mail NUNCA derruba
    // o fechamento (que é irreversível e já foi persistido).
    await this.notifyWinners(snapshot.payouts);
    return snapshot;
  }

  /** Envia o e-mail de premiação a cada payout com destinatário. Best-effort. */
  private async notifyWinners(payouts: ClosureSnapshotDto['payouts']): Promise<void> {
    for (const p of payouts) {
      if (!p.user?.email) continue;
      try {
        await this.email.sendPrizeAwarded(
          p.user.email,
          p.user.name,
          p.categoryLabel,
          p.amountCents,
        );
      } catch (e) {
        this.logger.warn(
          `Falha ao enviar e-mail de premiação para ${p.user.email}: ${(e as Error).message}`,
        );
      }
    }
  }

  /**
   * Builds a CSV report of the persisted payouts, ordered by displayPosition
   * then by user name. Throws if the competition is not yet finalised.
   * Columns: posicao, user_id, nome, email, categoria, valor_brl, paid_at,
   * payment_reference.
   */
  async payoutReportCsv(): Promise<string> {
    const snap = await this.getSnapshot();
    const rows = snap.payouts.map((p) => ({
      posicao: p.displayPosition,
      user_id: p.user?.id ?? '',
      nome: p.user?.name ?? '— (organização)',
      email: p.user?.email ?? '',
      categoria: p.categoryLabel,
      valor_brl: (p.amountCents / 100).toFixed(2),
      paid_at: p.paidAt ?? '',
      payment_reference: p.paymentReference ?? '',
    }));
    return csvStringify(rows, {
      header: true,
      columns: [
        'posicao',
        'user_id',
        'nome',
        'email',
        'categoria',
        'valor_brl',
        'paid_at',
        'payment_reference',
      ],
    });
  }

  /**
   * Marks a single payout as paid. Idempotent: re-calling on an already-paid
   * payout updates only the payment_reference (when changed) and keeps the
   * original paid_at timestamp + paid_by_admin_id intact. Returns the
   * updated payout row.
   */
  async markPaid(
    payoutId: string,
    adminId: string,
    paymentReference: string | null,
  ): Promise<ClosureSnapshotDto['payouts'][number]> {
    const existing = await this.prisma.prizePayout.findUnique({
      where: { id: payoutId },
      select: {
        id: true,
        competitionId: true,
        userId: true,
        paidAt: true,
        paidByAdminId: true,
        paymentReference: true,
      },
    });
    if (!existing) throw new NotFoundException(`Payout ${payoutId} not found`);
    if (existing.competitionId !== FIFA_WC_2026_ID) {
      throw new BadRequestException('Payout belongs to a different competition');
    }
    if (existing.userId === null) {
      throw new BadRequestException({
        code: 'ADMIN_SLOT_CANNOT_BE_MARKED_PAID',
        message: 'The admin slot has no recipient — mark it paid off-app.',
      });
    }

    const reference = paymentReference ?? null;
    if (existing.paidAt) {
      // Already paid — touch only payment_reference if it changed.
      if (reference === existing.paymentReference) {
        return this.formatPayoutRow(payoutId);
      }
      await this.prisma.prizePayout.update({
        where: { id: payoutId },
        data: { paymentReference: reference },
      });
      return this.formatPayoutRow(payoutId);
    }

    await this.prisma.prizePayout.update({
      where: { id: payoutId },
      data: {
        paidAt: new Date(),
        paidByAdminId: adminId,
        paymentReference: reference,
      },
    });
    this.logger.log(`Payout ${payoutId} marked paid by admin ${adminId}`);

    const row = await this.formatPayoutRow(payoutId);
    // E-mail "prêmio pago — confirme o recebimento". Best-effort.
    if (row.user?.email) {
      try {
        await this.email.sendPrizePaid(
          row.user.email,
          row.user.name,
          row.categoryLabel,
          row.amountCents,
          row.user.pixKey,
          row.paymentReference,
        );
      } catch (e) {
        this.logger.warn(
          `Falha ao enviar e-mail de prêmio pago para ${row.user.email}: ${(e as Error).message}`,
        );
      }
    }
    return row;
  }

  private async formatPayoutRow(payoutId: string): Promise<ClosureSnapshotDto['payouts'][number]> {
    const row = await this.prisma.prizePayout.findUnique({
      where: { id: payoutId },
      include: {
        user: { select: { id: true, name: true, email: true, pixKey: true } },
      },
    });
    if (!row) throw new NotFoundException(`Payout ${payoutId} disappeared mid-request`);
    return {
      id: row.id,
      category: row.category as PrizeCategory,
      categoryLabel: PRIZE_LABELS[row.category as PrizeCategory],
      displayPosition: CATEGORY_DISPLAY_POSITION[row.category as PrizeCategory] ?? 99,
      amountCents: row.amountCents,
      percentage: row.percentage,
      user: row.user
        ? {
            id: row.user.id,
            name: row.user.name,
            email: row.user.email,
            pixKey: row.user.pixKey,
          }
        : null,
      paidAt: row.paidAt?.toISOString() ?? null,
      paidByAdminId: row.paidByAdminId,
      paymentReference: row.paymentReference,
    };
  }

  /**
   * Returns the persisted closure snapshot. Throws if the competition has
   * not yet been finalised (no snapshot exists).
   */
  async getSnapshot(): Promise<ClosureSnapshotDto> {
    const competition = await this.prisma.competition.findUnique({
      where: { id: FIFA_WC_2026_ID },
      select: { closureStatus: true },
    });
    if (!competition) throw new NotFoundException('Competition not initialized — run seed');
    if (competition.closureStatus !== 'finalized') {
      throw new ConflictException({
        code: 'NOT_FINALIZED',
        message: 'Closure snapshot not available — competition is not yet finalized.',
      });
    }
    return this.buildSnapshot();
  }

  private async persistFinalization(payouts: FinalPrizePayoutDto[]): Promise<void> {
    const now = new Date();
    await this.prisma.$transaction([
      this.prisma.prizePayout.deleteMany({
        where: { competitionId: FIFA_WC_2026_ID },
      }),
      this.prisma.prizePayout.createMany({
        data: payouts.map((p) => ({
          competitionId: FIFA_WC_2026_ID,
          userId: p.userId,
          category: p.category,
          amountCents: p.amountCents,
          percentage: p.percentage,
        })),
      }),
      this.prisma.competition.update({
        where: { id: FIFA_WC_2026_ID },
        data: { closureStatus: 'finalized' },
      }),
      // Refuse any future palpite edits regardless of the kickoff clock.
      this.prisma.match.updateMany({
        where: { competitionId: FIFA_WC_2026_ID, resultLockedAt: null },
        data: { resultLockedAt: now },
      }),
    ]);
  }

  private async buildSnapshot(): Promise<ClosureSnapshotDto> {
    const [competition, rows, totalSubscribers, sample] = await Promise.all([
      this.prisma.competition.findUnique({
        where: { id: FIFA_WC_2026_ID },
        select: { id: true, closureStatus: true },
      }),
      this.prisma.prizePayout.findMany({
        where: { competitionId: FIFA_WC_2026_ID },
        include: {
          user: {
            select: { id: true, name: true, email: true, pixKey: true },
          },
        },
        orderBy: { createdAt: 'asc' },
      }),
      this.prisma.subscription.count({
        where: { competitionId: FIFA_WC_2026_ID, status: 'active' },
      }),
      this.prisma.subscription.findFirst({
        where: { competitionId: FIFA_WC_2026_ID, status: 'active' },
        select: { amountCents: true },
      }),
    ]);
    if (!competition) throw new NotFoundException('Competition not initialized — run seed');

    const amountCents = sample?.amountCents ?? 5000;
    const finalizedAt =
      rows.length > 0
        ? rows
            .map((r) => r.createdAt.getTime())
            .reduce((a, b) => Math.min(a, b), Infinity)
        : null;

    const payouts: AdminPrizePayoutDto[] = rows
      .map((r) => ({
        id: r.id,
        category: r.category as PrizeCategory,
        categoryLabel: PRIZE_LABELS[r.category as PrizeCategory],
        displayPosition: CATEGORY_DISPLAY_POSITION[r.category as PrizeCategory] ?? 99,
        amountCents: r.amountCents,
        percentage: r.percentage,
        user: r.user
          ? {
              id: r.user.id,
              name: r.user.name,
              email: r.user.email,
              pixKey: r.user.pixKey,
            }
          : null,
        paidAt: r.paidAt?.toISOString() ?? null,
        paidByAdminId: r.paidByAdminId,
        paymentReference: r.paymentReference,
      }))
      .sort((a, b) => a.displayPosition - b.displayPosition);

    return {
      competitionId: competition.id,
      closureStatus: competition.closureStatus,
      finalizedAt: finalizedAt ? new Date(finalizedAt).toISOString() : null,
      totalSubscribers,
      poolTotalCents: totalSubscribers * amountCents,
      totalDistributedCents: payouts.reduce((a, p) => a + p.amountCents, 0),
      payouts,
    };
  }

  private async amountCents(): Promise<number> {
    const sample = await this.prisma.subscription.findFirst({
      where: { competitionId: FIFA_WC_2026_ID, status: 'active' },
      select: { amountCents: true },
    });
    return sample?.amountCents ?? 5000;
  }

  private async loadRanking(): Promise<RankedUser[]> {
    const view = await this.ranking.getGeneralRanking({ limit: 1000 });
    return view.rows.map((r) => ({
      userId: r.userId,
      name: r.name,
      points: r.points,
    }));
  }

  /**
   * Mirrors PrizeService.loadExactScores — we read the live counters
   * straight from Redis. After finalisation the result is persisted into
   * prize_payouts so the snapshot is stable even if Redis is rebuilt later.
   */
  private async loadExactScores(): Promise<ExactScoreUser[]> {
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
