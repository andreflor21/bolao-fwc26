import {
  BadRequestException,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { scoreGuess, officialResultHash } from '../domain/scoring/score-engine';
import { RankingService } from '../ranking/ranking.service';
import { PrizeService } from '../prize/prize.service';
import type { RegisterMatchResultBody } from './dto/register-result.dto';

export interface RegisterResultPreview {
  applied: false;
  preview: {
    matchId: string;
    homeGoals: number;
    awayGoals: number;
    affectedGuesses: number;
    pointsByRule: Record<string, { count: number; points: number }>;
    totalPointsAwarded: number;
    /** True if recording this result would change a previously recorded value. */
    overwritesPrior: boolean;
    /** True if the same (matchId, homeGoals, awayGoals) is already recorded. */
    noChange: boolean;
  };
}

export interface RegisterResultApplied {
  applied: true;
  matchId: string;
  scored: number;
  totalPointsAwarded: number;
  noChange: boolean;
}

@Injectable()
export class AdminMatchService {
  private readonly logger = new Logger(AdminMatchService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly ranking: RankingService,
    private readonly prize: PrizeService,
  ) {}

  async registerResult(
    matchId: string,
    body: RegisterMatchResultBody,
  ): Promise<RegisterResultPreview | RegisterResultApplied> {
    const match = await this.prisma.match.findUnique({
      where: { id: matchId },
      select: {
        id: true,
        homeGoalsOfficial: true,
        awayGoalsOfficial: true,
        resultLockedAt: true,
      },
    });
    if (!match) throw new NotFoundException(`Match ${matchId} not found`);

    const noChange =
      match.homeGoalsOfficial === body.homeGoals && match.awayGoalsOfficial === body.awayGoals;
    const overwritesPrior =
      match.homeGoalsOfficial !== null &&
      match.awayGoalsOfficial !== null &&
      !noChange;

    if (overwritesPrior) {
      // Refuse silent overwrites — Sprint 3 will surface an explicit
      // "override" endpoint with audit trail.
      throw new BadRequestException({
        code: 'RESULT_ALREADY_RECORDED',
        message: `Match ${matchId} already has a recorded result. Refusing to overwrite.`,
        existing: { homeGoals: match.homeGoalsOfficial, awayGoals: match.awayGoalsOfficial },
        attempted: { homeGoals: body.homeGoals, awayGoals: body.awayGoals },
      });
    }

    const guesses = await this.prisma.guess.findMany({
      where: { matchId },
      select: { id: true, homeGoals: true, awayGoals: true },
    });

    const pointsByRule: Record<string, { count: number; points: number }> = {};
    let totalPointsAwarded = 0;
    const scored = guesses.map((g) => {
      const result = scoreGuess(g, body);
      pointsByRule[result.ruleApplied] = {
        count: (pointsByRule[result.ruleApplied]?.count ?? 0) + 1,
        points: (pointsByRule[result.ruleApplied]?.points ?? 0) + result.points,
      };
      totalPointsAwarded += result.points;
      return { guessId: g.id, points: result.points, ruleApplied: result.ruleApplied };
    });

    if (!body.confirmPreview) {
      return {
        applied: false,
        preview: {
          matchId,
          homeGoals: body.homeGoals,
          awayGoals: body.awayGoals,
          affectedGuesses: guesses.length,
          pointsByRule,
          totalPointsAwarded,
          overwritesPrior: false,
          noChange,
        },
      };
    }

    if (noChange) {
      // Idempotent no-op: result already matches.
      return {
        applied: true,
        matchId,
        scored: 0,
        totalPointsAwarded: 0,
        noChange: true,
      };
    }

    const hash = officialResultHash(body);
    const now = new Date();

    await this.prisma.$transaction([
      this.prisma.match.update({
        where: { id: matchId },
        data: {
          homeGoalsOfficial: body.homeGoals,
          awayGoalsOfficial: body.awayGoals,
          resultLockedAt: now,
        },
      }),
      ...scored.map((s) =>
        this.prisma.guessScore.upsert({
          where: { guessId: s.guessId },
          create: {
            guessId: s.guessId,
            points: s.points,
            ruleApplied: s.ruleApplied,
            officialResultHash: hash,
          },
          update: {
            points: s.points,
            ruleApplied: s.ruleApplied,
            officialResultHash: hash,
            computedAt: now,
          },
        }),
      ),
    ]);

    this.logger.log(
      `Match ${matchId} result registered: ${body.homeGoals}-${body.awayGoals} → ${scored.length} guesses scored, ${totalPointsAwarded} pts awarded`,
    );

    // Ranking + prize cache invalidation. Best-effort: failure here must not
    // roll back the result registration (the scoring is the source of truth;
    // ranking can be rebuilt with /admin/recompute).
    try {
      await this.ranking.recomputeForMatch(matchId);
      await this.prize.invalidate();
    } catch (e) {
      this.logger.warn(
        `Ranking recompute failed after match ${matchId}: ${(e as Error).message}`,
      );
    }

    return {
      applied: true,
      matchId,
      scored: scored.length,
      totalPointsAwarded,
      noChange: false,
    };
  }
}
