import {
  BadRequestException,
  ConflictException,
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
  type ScoreRule,
} from '@bolao/shared';
import { buildBracket } from '../domain/bracket/bracket-engine';
import type { FifaRanks, GroupMatchResult } from '../domain/bracket/types';
import type { SaveDraftGuessesBody } from './dto/save-draft.dto';
import type { SaveKnockoutScoresBody } from './dto/save-knockout-scores.dto';

interface StoredBracketPayload {
  bracket: BracketPreviewDto;
  knockoutScores: Record<string, KnockoutScoreEntryDto>;
  /** Per-group manual tie-break order set by the user via the resolver UI. */
  manualTiebreakOrder?: Partial<Record<GroupLetter, string[]>>;
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
        score: { select: { points: true, ruleApplied: true } },
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
        score: g.score
          ? { points: g.score.points, ruleApplied: g.score.ruleApplied as ScoreRule }
          : null,
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
  /**
   * Trava pós-finalização: uma vez submetidos, os palpites de grupo não podem
   * mais ser alterados nem re-submetidos (independente do lock da Copa).
   */
  private async assertGroupNotSubmitted(userId: string): Promise<void> {
    const submitted = await this.prisma.guess.findFirst({
      where: { userId, submittedAt: { not: null } },
      select: { id: true },
    });
    if (submitted) {
      throw new ConflictException({
        code: 'GROUP_ALREADY_SUBMITTED',
        message:
          'Seus palpites da fase de grupos já foram finalizados e não podem mais ser alterados.',
      });
    }
  }

  /**
   * Garante que o mata-mata ainda NÃO foi finalizado. Uma vez submetido
   * (knockoutSubmittedAt setado), o bracket fica congelado — nenhum score,
   * desempate ou re-submissão é aceito (mesma regra da fase de grupos).
   */
  private assertKnockoutNotSubmitted(payload: StoredBracketPayload): void {
    if (payload.knockoutSubmittedAt) {
      throw new ConflictException({
        code: 'KNOCKOUT_ALREADY_SUBMITTED',
        message:
          'Seus palpites do mata-mata já foram finalizados e não podem mais ser alterados.',
      });
    }
  }

  async saveDraft(userId: string, body: SaveDraftGuessesBody): Promise<{ saved: number }> {
    await this.competition.assertOpen();
    await this.assertGroupNotSubmitted(userId);

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
    await this.assertGroupNotSubmitted(userId);

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

    const existing = await this.loadPayload(userId);
    const bracket = this.computeBracket(
      allMatches,
      guessByMatchId,
      undefined,
      existing?.manualTiebreakOrder,
    );
    const now = new Date();
    const payload: StoredBracketPayload = {
      bracket,
      knockoutScores: existing?.knockoutScores ?? {},
      manualTiebreakOrder: existing?.manualTiebreakOrder ?? {},
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
          homeGoalsOfficial: true,
          awayGoalsOfficial: true,
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
    const preview = this.computeBracket(
      allMatches,
      guessByMatchId,
      payload?.knockoutScores,
      payload?.manualTiebreakOrder,
    );
    preview.official = await this.computeOfficialBracket(allMatches);
    return preview;
  }

  /**
   * Estado OFICIAL da competição a partir dos resultados reais: classificações
   * reais dos grupos + melhores 3º reais + resultados reais do mata-mata.
   * Reusa o mesmo motor `buildBracket` alimentado com os placares oficiais.
   */
  private async computeOfficialBracket(
    groupMatchRows: Array<{
      id: string;
      groupLetter: string | null;
      homeGoalsOfficial: number | null;
      awayGoalsOfficial: number | null;
      homeTeam: { code: string; seededRank: number } | null;
      awayTeam: { code: string; seededRank: number } | null;
    }>,
  ): Promise<BracketPreviewDto['official']> {
    const [teams, koMatches, competition] = await Promise.all([
      this.prisma.team.findMany({
        where: { competitionId: FIFA_WC_2026_ID },
        select: { code: true, seededRank: true },
      }),
      this.prisma.match.findMany({
        where: { competitionId: FIFA_WC_2026_ID, stage: { not: 'group' } },
        select: {
          bracketFixtureId: true,
          homeGoalsOfficial: true,
          awayGoalsOfficial: true,
          advancesTeamCode: true,
          homeTeam: { select: { code: true } },
          awayTeam: { select: { code: true } },
        },
      }),
      this.prisma.competition.findUnique({
        where: { id: FIFA_WC_2026_ID },
        select: { officialTiebreak: true },
      }),
    ]);

    const fifaRanks: Record<string, number> = {};
    for (const t of teams) fifaRanks[t.code] = t.seededRank;

    const officialGroupMatches = groupMatchRows
      .filter(
        (m) =>
          m.groupLetter &&
          m.homeTeam &&
          m.awayTeam &&
          m.homeGoalsOfficial !== null &&
          m.awayGoalsOfficial !== null,
      )
      .map((m) => ({
        groupLetter: m.groupLetter as GroupLetter,
        homeTeamCode: m.homeTeam!.code,
        awayTeamCode: m.awayTeam!.code,
        homeGoals: m.homeGoalsOfficial as number,
        awayGoals: m.awayGoalsOfficial as number,
      }));

    const officialKnockoutScores: Record<
      string,
      { homeGoals: number; awayGoals: number; advancesTeamCode: string | null }
    > = {};
    const results: NonNullable<BracketPreviewDto['official']>['results'] = {};
    for (const m of koMatches) {
      if (
        m.bracketFixtureId &&
        m.homeGoalsOfficial !== null &&
        m.awayGoalsOfficial !== null
      ) {
        officialKnockoutScores[m.bracketFixtureId] = {
          homeGoals: m.homeGoalsOfficial,
          awayGoals: m.awayGoalsOfficial,
          advancesTeamCode: m.advancesTeamCode ?? null,
        };
        results[m.bracketFixtureId] = {
          fixtureId: m.bracketFixtureId,
          homeTeamCode: m.homeTeam?.code ?? null,
          awayTeamCode: m.awayTeam?.code ?? null,
          homeGoals: m.homeGoalsOfficial,
          awayGoals: m.awayGoalsOfficial,
          advancesTeamCode: m.advancesTeamCode ?? null,
        };
      }
    }

    const manual =
      (competition?.officialTiebreak as Partial<Record<GroupLetter, string[]>> | null) ?? {};
    const official = buildBracket({
      groupMatches: officialGroupMatches,
      fifaRanks,
      knockoutScores: officialKnockoutScores,
      manualTiebreakOrder: manual,
    });

    return {
      groups: official.groups,
      bestThirds: official.bestThirds,
      results,
    };
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
        points: {},
        officialResults: {},
        submittedAt: null,
        isOpen: locksAt > now,
        locksAt: locksAt.toISOString(),
        groupSubmitted: false,
      };
    }

    // Pontos do mata-mata (materializados ao lançar cada resultado) + os
    // resultados oficiais, pra UI mostrar "quanto fiz" por confronto.
    const [koScores, koMatches] = await Promise.all([
      this.prisma.knockoutGuessScore.findMany({
        where: { userId, competitionId: FIFA_WC_2026_ID },
        select: { fixtureId: true, points: true, teamPoints: true, scorePoints: true },
      }),
      this.prisma.match.findMany({
        where: {
          competitionId: FIFA_WC_2026_ID,
          stage: { not: 'group' },
          homeGoalsOfficial: { not: null },
          awayGoalsOfficial: { not: null },
        },
        select: {
          bracketFixtureId: true,
          homeGoalsOfficial: true,
          awayGoalsOfficial: true,
          advancesTeamCode: true,
          homeTeam: { select: { code: true } },
          awayTeam: { select: { code: true } },
        },
      }),
    ]);
    const points: MyKnockoutGuessesDto['points'] = {};
    for (const s of koScores) {
      points[s.fixtureId] = {
        points: s.points,
        teamPoints: s.teamPoints,
        scorePoints: s.scorePoints,
      };
    }
    const officialResults: MyKnockoutGuessesDto['officialResults'] = {};
    for (const m of koMatches) {
      if (m.bracketFixtureId && m.homeGoalsOfficial !== null && m.awayGoalsOfficial !== null) {
        officialResults[m.bracketFixtureId] = {
          homeTeamCode: m.homeTeam?.code ?? null,
          awayTeamCode: m.awayTeam?.code ?? null,
          homeGoals: m.homeGoalsOfficial,
          awayGoals: m.awayGoalsOfficial,
          advancesTeamCode: m.advancesTeamCode ?? null,
        };
      }
    }

    return {
      fixtures: payload.bracket.fixtures,
      scores: payload.knockoutScores ?? {},
      points,
      officialResults,
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
    this.assertKnockoutNotSubmitted(existing);

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

    const refreshedBracket = await this.rebuildBracketFor(
      userId,
      next,
      existing.manualTiebreakOrder,
    );
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
    manualTiebreakOrder: Partial<Record<GroupLetter, string[]>> | undefined,
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
    return this.computeBracket(allMatches, guessByMatchId, knockoutScores, manualTiebreakOrder);
  }

  /**
   * Marca a submissão do mata-mata como final. Uma vez submetido, NÃO pode mais
   * ser alterado nem re-submetido (igual à fase de grupos) — lança
   * KNOCKOUT_ALREADY_SUBMITTED.
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
    this.assertKnockoutNotSubmitted(existing);

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
        manualTiebreakOrder: {},
        groupSubmittedAt: new Date(0).toISOString(),
        knockoutSubmittedAt: null,
      };
    }
    const stored = raw as StoredBracketPayload;
    return { ...stored, manualTiebreakOrder: stored.manualTiebreakOrder ?? {} };
  }

  /**
   * Saves the per-group manual tie-break order chosen by the user, then
   * recomputes the bracket so downstream R32+ slots reflect the new ordering
   * immediately. Requires group palpites already submitted (the bracket
   * snapshot must exist).
   */
  async saveManualTiebreakOrder(
    userId: string,
    order: Partial<Record<GroupLetter, string[]>>,
  ): Promise<{ bracket: BracketPreviewDto }> {
    await this.competition.assertOpen();

    const existing = await this.loadPayload(userId);
    if (!existing) {
      throw new BadRequestException({
        code: 'GROUP_NOT_SUBMITTED',
        message: 'Submit group palpites before saving manual tie-break order',
      });
    }
    this.assertKnockoutNotSubmitted(existing);

    const merged: Partial<Record<GroupLetter, string[]>> = {
      ...(existing.manualTiebreakOrder ?? {}),
    };
    for (const [letter, teams] of Object.entries(order)) {
      if (!teams || teams.length === 0) delete merged[letter as GroupLetter];
      else merged[letter as GroupLetter] = [...teams];
    }

    const refreshed = await this.rebuildBracketFor(
      userId,
      existing.knockoutScores ?? {},
      merged,
    );
    const payload: StoredBracketPayload = {
      ...existing,
      bracket: refreshed,
      manualTiebreakOrder: merged,
    };
    await this.prisma.bracketPrediction.update({
      where: { userId_competitionId: { userId, competitionId: FIFA_WC_2026_ID } },
      data: { payload: payload as unknown as object },
    });

    return { bracket: refreshed };
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
    manualTiebreakOrder?: Partial<Record<GroupLetter, string[]>>,
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

    return buildBracket({ groupMatches, fifaRanks, knockoutScores, manualTiebreakOrder });
  }
}
