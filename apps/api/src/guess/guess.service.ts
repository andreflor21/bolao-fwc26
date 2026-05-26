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
  type BracketPreviewDto,
  type GroupLetter,
  type GuessDto,
  type KnockoutScoreEntryDto,
  type MyGuessesDto,
  type MyKnockoutGuessesDto,
} from '@bolao/shared';
import { buildBracket } from '../domain/bracket/bracket-engine';
import type { FifaRanks, GroupMatchResult } from '../domain/bracket/types';
import type { SaveDraftGuessesBody } from './dto/save-draft.dto';
import type { SaveKnockoutScoresBody } from './dto/save-knockout-scores.dto';

interface StoredBracketPayload {
  bracket: BracketPreviewDto;
  knockoutScores: Record<string, KnockoutScoreEntryDto>;
  groupSubmittedAt: string;
  knockoutSubmittedAt: string | null;
}

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
   * Finalises the user's group-stage submission. Requires all 72 group-stage
   * matches to have a guess. Runs the BracketEngine and persists a snapshot
   * of the derived knockout bracket. Idempotent: a second call refreshes
   * the snapshot using whatever values are currently in `guesses` while
   * PRESERVING any knockout score predictions already saved.
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
    const existing = await this.loadPayload(userId);
    const now = new Date();
    const payload: StoredBracketPayload = {
      bracket,
      knockoutScores: existing?.knockoutScores ?? {},
      groupSubmittedAt: now.toISOString(),
      knockoutSubmittedAt: existing?.knockoutSubmittedAt ?? null,
    };

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
          payload: payload as unknown as object,
          submittedAt: now,
        },
        update: {
          payload: payload as unknown as object,
          submittedAt: now,
        },
      }),
    ]);

    return { submittedAt: now.toISOString(), matches: allMatches.length };
  }

  /**
   * Returns the current bracket preview based on whatever guesses exist
   * (draft or submitted), with R16+ propagated using any saved knockout
   * scores. Useful for live UI while user is still editing.
   */
  async getBracketPreview(userId: string): Promise<BracketPreviewDto> {
    const [allMatches, payload] = await Promise.all([
      this.prisma.match.findMany({
        where: { competitionId: FIFA_WC_2026_ID, stage: 'group' },
        select: {
          id: true,
          groupLetter: true,
          homeTeam: { select: { code: true, seededRank: true } },
          awayTeam: { select: { code: true, seededRank: true } },
        },
      }),
      this.loadPayload(userId),
    ]);
    const userGuesses = await this.prisma.guess.findMany({
      where: { userId, matchId: { in: allMatches.map((m) => m.id) } },
      select: { matchId: true, homeGoals: true, awayGoals: true },
    });
    const guessByMatchId = new Map(userGuesses.map((g) => [g.matchId, g] as const));
    return this.computeBracket(allMatches, guessByMatchId, payload?.knockoutScores);
  }

  /**
   * Returns the user's saved KO score predictions + the fixtures (with
   * predicted team codes) needed to render the input UI. Requires group
   * palpites to be submitted — otherwise the bracket structure isn't
   * finalised and KO predictions don't make sense.
   */
  async getMyKnockoutGuesses(userId: string): Promise<MyKnockoutGuessesDto> {
    const [payload, locksAt] = await Promise.all([
      this.loadPayload(userId),
      this.competition.getKnockoutLockAt(),
    ]);

    const now = new Date();
    if (!payload) {
      return {
        fixtures: [],
        scores: {},
        submittedAt: null,
        isOpen: locksAt > now,
        locksAt: locksAt.toISOString(),
        groupSubmitted: false,
      };
    }

    return {
      fixtures: payload.bracket.fixtures,
      scores: payload.knockoutScores ?? {},
      submittedAt: payload.knockoutSubmittedAt,
      isOpen: locksAt > now,
      locksAt: locksAt.toISOString(),
      groupSubmitted: true,
    };
  }

  /**
   * Upserts knockout score predictions. Validates that group palpites are
   * submitted (so the bracket exists) and that the KO lock has not passed.
   * Rebuilds the bracket on every save so downstream R16+ slots reflect the
   * latest user predictions.
   */
  async saveKnockoutScores(
    userId: string,
    body: SaveKnockoutScoresBody,
  ): Promise<{ saved: number; bracket: BracketPreviewDto }> {
    await this.competition.assertKnockoutOpen();

    const existing = await this.loadPayload(userId);
    if (!existing) {
      throw new BadRequestException({
        code: 'GROUP_NOT_SUBMITTED',
        message: 'Submit group palpites before saving knockout scores',
      });
    }

    const fixtureIndex = new Map(existing.bracket.fixtures.map((f) => [f.id, f] as const));
    const invalid = body.scores.filter((s) => !fixtureIndex.has(s.fixtureId));
    if (invalid.length > 0) {
      throw new BadRequestException({
        code: 'INVALID_FIXTURE_IDS',
        message: `Unknown fixture IDs: ${invalid.map((s) => s.fixtureId).slice(0, 5).join(', ')}`,
      });
    }

    // Validate advancesTeamCode when score is a draw — must be one of the
    // two teams currently resolved for the fixture (could still be null on
    // higher rounds whose chain hasn't filled in yet — in which case any
    // string is accepted defensively, but won't propagate).
    for (const s of body.scores) {
      if (s.homeGoals === s.awayGoals && s.advancesTeamCode) {
        const f = fixtureIndex.get(s.fixtureId)!;
        const candidates = [f.topTeamCode, f.bottomTeamCode].filter(
          (c): c is string => c !== null,
        );
        if (candidates.length === 2 && !candidates.includes(s.advancesTeamCode)) {
          throw new BadRequestException({
            code: 'INVALID_ADVANCES_TEAM',
            message: `advancesTeamCode for ${s.fixtureId} must be one of ${candidates.join(', ')}`,
          });
        }
      }
    }

    const next: Record<string, KnockoutScoreEntryDto> = { ...(existing.knockoutScores ?? {}) };
    for (const s of body.scores) {
      next[s.fixtureId] = {
        homeGoals: s.homeGoals,
        awayGoals: s.awayGoals,
        advancesTeamCode: s.advancesTeamCode ?? null,
      };
    }

    const refreshedBracket = await this.rebuildBracketFor(userId, next);
    const payload: StoredBracketPayload = {
      ...existing,
      bracket: refreshedBracket,
      knockoutScores: next,
    };
    await this.prisma.bracketPrediction.update({
      where: { userId_competitionId: { userId, competitionId: FIFA_WC_2026_ID } },
      data: { payload: payload as unknown as object },
    });

    return { saved: body.scores.length, bracket: refreshedBracket };
  }

  /**
   * Recomputes the bracket using the user's current group palpites + the
   * provided KO scores. Used by saveKnockoutScores so the response reflects
   * the propagated R16+ teams immediately.
   */
  private async rebuildBracketFor(
    userId: string,
    knockoutScores: Record<string, KnockoutScoreEntryDto>,
  ): Promise<BracketPreviewDto> {
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
    return this.computeBracket(allMatches, guessByMatchId, knockoutScores);
  }

  /**
   * Marks the knockout submission as final. Idempotent: re-submitting
   * refreshes the timestamp.
   */
  async submitKnockoutGuesses(
    userId: string,
  ): Promise<{ submittedAt: string; scored: number }> {
    await this.competition.assertKnockoutOpen();

    const existing = await this.loadPayload(userId);
    if (!existing) {
      throw new BadRequestException({
        code: 'GROUP_NOT_SUBMITTED',
        message: 'Submit group palpites before submitting knockout scores',
      });
    }

    const now = new Date();
    const payload: StoredBracketPayload = {
      ...existing,
      knockoutSubmittedAt: now.toISOString(),
    };
    await this.prisma.bracketPrediction.update({
      where: { userId_competitionId: { userId, competitionId: FIFA_WC_2026_ID } },
      data: { payload: payload as unknown as object },
    });

    return {
      submittedAt: now.toISOString(),
      scored: Object.keys(existing.knockoutScores ?? {}).length,
    };
  }

  private async loadPayload(userId: string): Promise<StoredBracketPayload | null> {
    const row = await this.prisma.bracketPrediction.findUnique({
      where: { userId_competitionId: { userId, competitionId: FIFA_WC_2026_ID } },
      select: { payload: true },
    });
    if (!row) return null;
    const raw = row.payload as unknown;
    // Legacy payloads (pre-KO) stored the BracketPreviewDto directly without
    // the wrapper. Detect and upgrade in-flight without persisting.
    if (raw && typeof raw === 'object' && 'fixtures' in raw && !('bracket' in raw)) {
      return {
        bracket: raw as BracketPreviewDto,
        knockoutScores: {},
        groupSubmittedAt: new Date(0).toISOString(),
        knockoutSubmittedAt: null,
      };
    }
    return raw as StoredBracketPayload;
  }

  private computeBracket(
    matches: Array<{
      id: string;
      groupLetter: string | null;
      homeTeam: { code: string; seededRank: number } | null;
      awayTeam: { code: string; seededRank: number } | null;
    }>,
    guesses: Map<string, { homeGoals: number; awayGoals: number }>,
    knockoutScores?: Record<string, KnockoutScoreEntryDto>,
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

    return buildBracket({ groupMatches, fifaRanks, knockoutScores });
  }
}
