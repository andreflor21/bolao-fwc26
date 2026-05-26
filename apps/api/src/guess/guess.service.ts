import {
  BadRequestException,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { CompetitionService } from '../competition/competition.service';
import {
  FIFA_WC_2026_ID,
  GROUP_STAGE_MATCH_COUNT,
  type GuessDto,
  type MyGuessesDto,
  type BracketPreviewDto,
  type GroupLetter,
} from '@bolao/shared';
import { buildBracket } from '../domain/bracket/bracket-engine';
import type { FifaRanks, GroupMatchResult } from '../domain/bracket/types';
import type { SaveDraftGuessesBody } from './dto/save-draft.dto';

@Injectable()
export class GuessService {
  private readonly logger = new Logger(GuessService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly competition: CompetitionService,
  ) {}

  async list(userId: string): Promise<MyGuessesDto> {
    const competition = await this.competition.getMain();
    const guesses = await this.prisma.guess.findMany({
      where: {
        userId,
        match: { competitionId: FIFA_WC_2026_ID, stage: 'group' },
      },
      select: {
        matchId: true,
        homeGoals: true,
        awayGoals: true,
        isDerived: true,
        submittedAt: true,
        updatedAt: true,
      },
    });

    const guessesByMatchId: Record<string, GuessDto> = {};
    let earliestSubmittedAt: Date | null = null;
    for (const g of guesses) {
      guessesByMatchId[g.matchId] = {
        matchId: g.matchId,
        homeGoals: g.homeGoals,
        awayGoals: g.awayGoals,
        isDerived: g.isDerived,
        submittedAt: g.submittedAt?.toISOString() ?? null,
        updatedAt: g.updatedAt.toISOString(),
      };
      if (g.submittedAt && (!earliestSubmittedAt || g.submittedAt < earliestSubmittedAt)) {
        earliestSubmittedAt = g.submittedAt;
      }
    }

    return {
      guesses: guessesByMatchId,
      submittedAt: earliestSubmittedAt?.toISOString() ?? null,
      locksAt: competition.locksAt.toISOString(),
      isOpen: competition.closureStatus === 'open' && competition.locksAt > new Date(),
    };
  }

  /**
   * Upserts draft guesses for group-stage matches. Does NOT mark them as
   * submitted — submission requires a separate explicit call to `submit()`.
   */
  async saveDraft(userId: string, body: SaveDraftGuessesBody): Promise<{ saved: number }> {
    await this.competition.assertOpen();

    const matchIds = body.guesses.map((g) => g.matchId);
    const validMatches = await this.prisma.match.findMany({
      where: {
        id: { in: matchIds },
        competitionId: FIFA_WC_2026_ID,
        stage: 'group',
      },
      select: { id: true },
    });
    const validSet = new Set(validMatches.map((m) => m.id));

    const invalid = matchIds.filter((id) => !validSet.has(id));
    if (invalid.length > 0) {
      throw new BadRequestException(
        `Invalid or non-group-stage matchIds: ${invalid.slice(0, 5).join(', ')}${invalid.length > 5 ? '…' : ''}`,
      );
    }

    await this.prisma.$transaction(
      body.guesses.map((g) =>
        this.prisma.guess.upsert({
          where: { userId_matchId: { userId, matchId: g.matchId } },
          create: {
            userId,
            matchId: g.matchId,
            homeGoals: g.homeGoals,
            awayGoals: g.awayGoals,
          },
          update: {
            homeGoals: g.homeGoals,
            awayGoals: g.awayGoals,
          },
        }),
      ),
    );

    return { saved: body.guesses.length };
  }

  /**
   * Finalises the user's submission. Requires all 72 group-stage matches to
   * have a guess. Runs the BracketEngine and persists a snapshot of the
   * derived knockout bracket. Idempotent: a second call refreshes the
   * snapshot using whatever values are currently in `guesses`.
   */
  async submit(userId: string): Promise<{ submittedAt: string; matches: number }> {
    await this.competition.assertOpen();

    const allMatches = await this.prisma.match.findMany({
      where: { competitionId: FIFA_WC_2026_ID, stage: 'group' },
      select: {
        id: true,
        groupLetter: true,
        homeTeam: { select: { code: true, seededRank: true } },
        awayTeam: { select: { code: true, seededRank: true } },
      },
    });
    if (allMatches.length !== GROUP_STAGE_MATCH_COUNT) {
      throw new NotFoundException(
        `Expected ${GROUP_STAGE_MATCH_COUNT} group matches, found ${allMatches.length}. Did you run the seed?`,
      );
    }

    const userGuesses = await this.prisma.guess.findMany({
      where: { userId, matchId: { in: allMatches.map((m) => m.id) } },
      select: { matchId: true, homeGoals: true, awayGoals: true },
    });
    const guessByMatchId = new Map(userGuesses.map((g) => [g.matchId, g] as const));
    const missing = allMatches.filter((m) => !guessByMatchId.has(m.id));
    if (missing.length > 0) {
      throw new BadRequestException({
        code: 'INCOMPLETE_GUESSES',
        message: `Submit requires all ${GROUP_STAGE_MATCH_COUNT} group matches. Missing ${missing.length}.`,
        missingMatchIds: missing.map((m) => m.id),
      });
    }

    const bracket = this.computeBracket(allMatches, guessByMatchId);
    const now = new Date();

    await this.prisma.$transaction([
      this.prisma.guess.updateMany({
        where: { userId, matchId: { in: allMatches.map((m) => m.id) } },
        data: { submittedAt: now },
      }),
      this.prisma.bracketPrediction.upsert({
        where: { userId_competitionId: { userId, competitionId: FIFA_WC_2026_ID } },
        create: {
          userId,
          competitionId: FIFA_WC_2026_ID,
          payload: bracket as unknown as object,
          submittedAt: now,
        },
        update: {
          payload: bracket as unknown as object,
          submittedAt: now,
        },
      }),
    ]);

    return { submittedAt: now.toISOString(), matches: allMatches.length };
  }

  /**
   * Returns the current bracket preview based on whatever guesses exist
   * (draft or submitted). Useful for live UI while user is still editing.
   */
  async getBracketPreview(userId: string): Promise<BracketPreviewDto> {
    const allMatches = await this.prisma.match.findMany({
      where: { competitionId: FIFA_WC_2026_ID, stage: 'group' },
      select: {
        id: true,
        groupLetter: true,
        homeTeam: { select: { code: true, seededRank: true } },
        awayTeam: { select: { code: true, seededRank: true } },
      },
    });
    const userGuesses = await this.prisma.guess.findMany({
      where: { userId, matchId: { in: allMatches.map((m) => m.id) } },
      select: { matchId: true, homeGoals: true, awayGoals: true },
    });
    const guessByMatchId = new Map(userGuesses.map((g) => [g.matchId, g] as const));
    return this.computeBracket(allMatches, guessByMatchId);
  }

  private computeBracket(
    matches: Array<{
      id: string;
      groupLetter: string | null;
      homeTeam: { code: string; seededRank: number } | null;
      awayTeam: { code: string; seededRank: number } | null;
    }>,
    guesses: Map<string, { homeGoals: number; awayGoals: number }>,
  ): BracketPreviewDto {
    const groupMatches: Array<GroupMatchResult & { groupLetter: GroupLetter }> = [];
    const fifaRanks: FifaRanks = {};

    for (const m of matches) {
      if (!m.homeTeam || !m.awayTeam || !m.groupLetter) continue;
      fifaRanks[m.homeTeam.code] = m.homeTeam.seededRank;
      fifaRanks[m.awayTeam.code] = m.awayTeam.seededRank;
      const guess = guesses.get(m.id);
      if (!guess) continue;
      groupMatches.push({
        groupLetter: m.groupLetter as GroupLetter,
        homeTeamCode: m.homeTeam.code,
        awayTeamCode: m.awayTeam.code,
        homeGoals: guess.homeGoals,
        awayGoals: guess.awayGoals,
      });
    }

    return buildBracket({ groupMatches, fifaRanks });
  }
}
