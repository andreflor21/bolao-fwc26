import {
  BadRequestException,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { FIFA_WC_2026_ID, GROUP_LETTERS, type GroupLetter } from '@bolao/shared';
import { PrismaService } from '../prisma/prisma.service';
import { RankingService } from '../ranking/ranking.service';
import { PrizeService } from '../prize/prize.service';
import { buildBracket } from '../domain/bracket/bracket-engine';
import type { GroupMatchResult } from '../domain/bracket/types';
import {
  deriveAdvancer,
  scorePlayerKnockoutFixture,
  type OfficialKnockoutResult,
} from '../domain/scoring/knockout-player-scoring';

interface RegisterKnockoutBody {
  homeGoals: number;
  awayGoals: number;
  /** Obrigatório quando o placar é empate (vaga decidida nos pênaltis). */
  advancesTeamCode?: string | null;
  confirmPreview?: boolean;
}

interface BracketFixturePred {
  id: string;
  topTeamCode: string | null;
  bottomTeamCode: string | null;
}
interface StoredPayload {
  bracket?: { fixtures?: BracketFixturePred[] };
  knockoutScores?: Record<
    string,
    { homeGoals: number; awayGoals: number; advancesTeamCode?: string | null }
  >;
}

@Injectable()
export class KnockoutService {
  private readonly logger = new Logger(KnockoutService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly ranking: RankingService,
    private readonly prize: PrizeService,
  ) {}

  /** Lista os 32 confrontos do mata-mata com times resolvidos + placar/estado. */
  async listFixtures() {
    const matches = await this.prisma.match.findMany({
      where: { competitionId: FIFA_WC_2026_ID, stage: { not: 'group' } },
      orderBy: { kickoffAt: 'asc' },
      select: {
        id: true,
        bracketFixtureId: true,
        stage: true,
        kickoffAt: true,
        city: true,
        homeGoalsOfficial: true,
        awayGoalsOfficial: true,
        advancesTeamCode: true,
        homeTeam: { select: { code: true, name: true } },
        awayTeam: { select: { code: true, name: true } },
      },
    });
    return matches.map((m) => ({
      matchId: m.id,
      fixtureId: m.bracketFixtureId,
      stage: m.stage,
      kickoffAt: m.kickoffAt.toISOString(),
      city: m.city,
      homeTeamCode: m.homeTeam?.code ?? null,
      homeTeamName: m.homeTeam?.name ?? null,
      awayTeamCode: m.awayTeam?.code ?? null,
      awayTeamName: m.awayTeam?.name ?? null,
      homeGoals: m.homeGoalsOfficial,
      awayGoals: m.awayGoalsOfficial,
      advancesTeamCode: m.advancesTeamCode,
      hasResult: m.homeGoalsOfficial !== null && m.awayGoalsOfficial !== null,
      teamsResolved: Boolean(m.homeTeam && m.awayTeam),
    }));
  }

  /**
   * Gera o chaveamento REAL a partir dos resultados oficiais. Chamado
   * automaticamente quando o 72º resultado de grupo é lançado, e também
   * (idempotente) a cada resultado de mata-mata para propagar os vencedores.
   *
   * Se sobrar empate de classificação que os critérios FIFA não resolvem e
   * não houver `officialTiebreak` cobrindo, lança erro pedindo a ordem manual.
   */
  async recomputeOfficialBracket(opts: { requireComplete?: boolean } = {}): Promise<{
    generated: boolean;
    needsManualTiebreak?: Array<{ groupLetter: string; teamCodes: string[] }>;
  }> {
    const [teams, matches, competition] = await Promise.all([
      this.prisma.team.findMany({
        where: { competitionId: FIFA_WC_2026_ID },
        select: { id: true, code: true, seededRank: true },
      }),
      this.prisma.match.findMany({
        where: { competitionId: FIFA_WC_2026_ID },
        select: {
          id: true,
          stage: true,
          groupLetter: true,
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

    const teamIdByCode = new Map(teams.map((t) => [t.code, t.id]));
    const fifaRanks: Record<string, number> = {};
    for (const t of teams) fifaRanks[t.code] = t.seededRank;

    // Resultados oficiais da fase de grupos.
    const groupMatches: Array<GroupMatchResult & { groupLetter: GroupLetter }> = [];
    for (const m of matches) {
      if (
        m.stage === 'group' &&
        m.groupLetter &&
        m.homeTeam &&
        m.awayTeam &&
        m.homeGoalsOfficial !== null &&
        m.awayGoalsOfficial !== null
      ) {
        groupMatches.push({
          groupLetter: m.groupLetter as GroupLetter,
          homeTeamCode: m.homeTeam.code,
          awayTeamCode: m.awayTeam.code,
          homeGoals: m.homeGoalsOfficial,
          awayGoals: m.awayGoalsOfficial,
        });
      }
    }

    if (opts.requireComplete && groupMatches.length < 72) {
      return { generated: false };
    }

    // Resultados oficiais do mata-mata viram "knockoutScores" pro engine,
    // que propaga os vencedores rodada a rodada (incl. empate → advances).
    const officialKnockoutScores: Record<
      string,
      { homeGoals: number; awayGoals: number; advancesTeamCode: string | null }
    > = {};
    for (const m of matches) {
      if (
        m.stage !== 'group' &&
        m.bracketFixtureId &&
        m.homeGoalsOfficial !== null &&
        m.awayGoalsOfficial !== null
      ) {
        officialKnockoutScores[m.bracketFixtureId] = {
          homeGoals: m.homeGoalsOfficial,
          awayGoals: m.awayGoalsOfficial,
          advancesTeamCode: m.advancesTeamCode ?? null,
        };
      }
    }

    const manual = (competition?.officialTiebreak as
      | Partial<Record<GroupLetter, string[]>>
      | null
      | undefined) ?? {};

    const bracket = buildBracket({
      groupMatches,
      fifaRanks,
      knockoutScores: officialKnockoutScores,
      manualTiebreakOrder: manual,
    });

    // Empates de classificação não resolvidos pelos critérios automáticos E
    // sem ordem manual → barra a geração e pede a decisão do admin.
    const blocking = bracket.unresolvedTies.filter((tie) => {
      const order = manual[tie.groupLetter];
      return !order || !tie.teamCodes.every((c) => order.includes(c));
    });
    if (blocking.length > 0) {
      return {
        generated: false,
        needsManualTiebreak: blocking.map((t) => ({
          groupLetter: t.groupLetter,
          teamCodes: t.teamCodes,
        })),
      };
    }

    // Sincroniza os times resolvidos em cada partida do mata-mata. NÃO mexe em
    // placares — só atribui home/away conforme o bracket oficial.
    const fixtureById = new Map(bracket.fixtures.map((f) => [f.id, f]));
    const koMatches = matches.filter((m) => m.stage !== 'group' && m.bracketFixtureId);
    await this.prisma.$transaction(
      koMatches.map((m) => {
        const f = fixtureById.get(m.bracketFixtureId!);
        const homeId = f?.topTeamCode ? teamIdByCode.get(f.topTeamCode) ?? null : null;
        const awayId = f?.bottomTeamCode ? teamIdByCode.get(f.bottomTeamCode) ?? null : null;
        return this.prisma.match.update({
          where: { id: m.id },
          data: { homeTeamId: homeId, awayTeamId: awayId },
        });
      }),
    );

    this.logger.log(
      `Bracket oficial recomputado: ${groupMatches.length} grupos, ${Object.keys(officialKnockoutScores).length} KO resolvidos`,
    );
    return { generated: true };
  }

  /**
   * Registra o resultado oficial de um confronto do mata-mata: pontua os
   * palpites de KO de cada jogador, persiste, propaga o vencedor pra próxima
   * rodada e recalcula o ranking. Em modo preview (`!confirmPreview`) só
   * devolve o impacto sem gravar.
   */
  async registerKnockoutResult(matchId: string, body: RegisterKnockoutBody) {
    const match = await this.prisma.match.findUnique({
      where: { id: matchId },
      select: {
        id: true,
        stage: true,
        bracketFixtureId: true,
        homeGoalsOfficial: true,
        awayGoalsOfficial: true,
        homeTeam: { select: { code: true } },
        awayTeam: { select: { code: true } },
      },
    });
    if (!match) throw new NotFoundException(`Match ${matchId} not found`);
    if (match.stage === 'group') {
      throw new BadRequestException('Use /admin/matches/:id/result para jogos de grupo');
    }
    if (!match.bracketFixtureId) {
      throw new BadRequestException('Match sem bracketFixtureId');
    }
    if (!match.homeTeam || !match.awayTeam) {
      throw new BadRequestException({
        code: 'TEAMS_NOT_RESOLVED',
        message: 'Os times deste confronto ainda não foram definidos.',
      });
    }

    const topTeamCode = match.homeTeam.code;
    const bottomTeamCode = match.awayTeam.code;
    const isDraw = body.homeGoals === body.awayGoals;
    const advances = body.advancesTeamCode ?? null;
    if (isDraw && advances !== topTeamCode && advances !== bottomTeamCode) {
      throw new BadRequestException({
        code: 'ADVANCES_REQUIRED',
        message: `Empate: informe advancesTeamCode (${topTeamCode} ou ${bottomTeamCode}).`,
      });
    }

    const noChange =
      match.homeGoalsOfficial === body.homeGoals && match.awayGoalsOfficial === body.awayGoals;
    const overwritesPrior =
      match.homeGoalsOfficial !== null && match.awayGoalsOfficial !== null && !noChange;
    if (overwritesPrior) {
      throw new BadRequestException({
        code: 'RESULT_ALREADY_RECORDED',
        message: `Confronto ${match.bracketFixtureId} já tem resultado. Recusando sobrescrever.`,
        existing: { homeGoals: match.homeGoalsOfficial, awayGoals: match.awayGoalsOfficial },
      });
    }

    const official: OfficialKnockoutResult = {
      fixtureId: match.bracketFixtureId,
      topTeamCode,
      bottomTeamCode,
      topGoals: body.homeGoals,
      bottomGoals: body.awayGoals,
    };

    // Pontua cada jogador que tem bracket submetido.
    const predictions = await this.prisma.bracketPrediction.findMany({
      where: { competitionId: FIFA_WC_2026_ID },
      select: { userId: true, payload: true },
    });
    const scored = predictions.map((p) => {
      const payload = (p.payload ?? {}) as StoredPayload;
      const predFixture = payload.bracket?.fixtures?.find((f) => f.id === official.fixtureId);
      const predScore = payload.knockoutScores?.[official.fixtureId];
      const result = scorePlayerKnockoutFixture(
        official,
        predFixture && predScore
          ? {
              topTeamCode: predFixture.topTeamCode,
              bottomTeamCode: predFixture.bottomTeamCode,
              topGoals: predScore.homeGoals,
              bottomGoals: predScore.awayGoals,
            }
          : undefined,
      );
      return { userId: p.userId, ...result };
    });
    const totalPointsAwarded = scored.reduce((s, x) => s + x.points, 0);
    const playersWithPoints = scored.filter((s) => s.points > 0).length;

    if (!body.confirmPreview) {
      return {
        applied: false as const,
        preview: {
          matchId,
          fixtureId: official.fixtureId,
          homeGoals: body.homeGoals,
          awayGoals: body.awayGoals,
          advancesTeamCode: deriveAdvancer(
            topTeamCode,
            bottomTeamCode,
            body.homeGoals,
            body.awayGoals,
            advances,
          ),
          affectedPlayers: predictions.length,
          playersWithPoints,
          totalPointsAwarded,
          overwritesPrior: false,
          noChange,
        },
      };
    }

    if (noChange) {
      return { applied: true as const, matchId, scored: 0, totalPointsAwarded: 0, noChange: true };
    }

    const now = new Date();
    const resolvedAdvances = deriveAdvancer(
      topTeamCode,
      bottomTeamCode,
      body.homeGoals,
      body.awayGoals,
      advances,
    );

    await this.prisma.$transaction([
      this.prisma.match.update({
        where: { id: matchId },
        data: {
          homeGoalsOfficial: body.homeGoals,
          awayGoalsOfficial: body.awayGoals,
          advancesTeamCode: resolvedAdvances,
          resultLockedAt: now,
        },
      }),
      ...scored.map((s) =>
        this.prisma.knockoutGuessScore.upsert({
          where: { userId_fixtureId: { userId: s.userId, fixtureId: official.fixtureId } },
          create: {
            userId: s.userId,
            competitionId: FIFA_WC_2026_ID,
            fixtureId: official.fixtureId,
            points: s.points,
            teamPoints: s.teamPoints,
            scorePoints: s.scorePoints,
          },
          update: {
            points: s.points,
            teamPoints: s.teamPoints,
            scorePoints: s.scorePoints,
            computedAt: now,
          },
        }),
      ),
    ]);

    this.logger.log(
      `KO ${official.fixtureId} resultado ${body.homeGoals}-${body.awayGoals}: ${scored.length} palpites pontuados, ${totalPointsAwarded} pts`,
    );

    // Propaga o vencedor pra próxima rodada + recalcula ranking/prêmios.
    // Best-effort: falha aqui não desfaz a pontuação (recuperável via recompute).
    try {
      await this.recomputeOfficialBracket();
      await this.ranking.recomputeAll();
      await this.prize.invalidate();
    } catch (e) {
      this.logger.warn(`Pós-KO ${official.fixtureId} falhou: ${(e as Error).message}`);
    }

    return {
      applied: true as const,
      matchId,
      fixtureId: official.fixtureId,
      scored: scored.length,
      totalPointsAwarded,
      noChange: false,
    };
  }

  /** Define a ordem manual de desempate oficial de um grupo e regera o bracket. */
  async setOfficialTiebreak(
    order: Partial<Record<GroupLetter, string[]>>,
  ): Promise<{ generated: boolean; needsManualTiebreak?: unknown }> {
    const competition = await this.prisma.competition.findUnique({
      where: { id: FIFA_WC_2026_ID },
      select: { officialTiebreak: true },
    });
    const existing =
      (competition?.officialTiebreak as Partial<Record<GroupLetter, string[]>> | null) ?? {};
    const merged: Partial<Record<GroupLetter, string[]>> = { ...existing };
    for (const letter of GROUP_LETTERS) {
      const teams = order[letter];
      if (teams && teams.length > 0) merged[letter] = [...teams];
    }
    await this.prisma.competition.update({
      where: { id: FIFA_WC_2026_ID },
      data: { officialTiebreak: merged as object },
    });
    return this.recomputeOfficialBracket();
  }

  /**
   * Distribuição dos palpites do grupo para UM confronto do mata-mata. Como os
   * palpites de KO ficam no JSON de cada `BracketPrediction` (e não na tabela
   * `Guess`), agregamos em memória:
   *  - `confrontoCount`: quantos cravaram o confronto exato (top/bottom no slot
   *    certo — mesmo critério de pontuação do {@link scoreKnockoutGuess});
   *  - `guesses`: distribuição dos placares cravados por essa galera, do mais
   *    jogado pro menos. Como eles acertaram a orientação oficial, o `homeGoals`
   *    do palpite já corresponde ao time mandante (top) oficial.
   *
   * Usado no broadcast "palpites mais jogados (mata-mata)".
   */
  async bracketScoreDistribution(
    fixtureId: string,
    officialTopCode: string,
    officialBottomCode: string,
  ): Promise<{
    confrontoCount: number;
    guesses: Array<{ homeGoals: number; awayGoals: number; count: number }>;
  }> {
    const predictions = await this.prisma.bracketPrediction.findMany({
      where: { competitionId: FIFA_WC_2026_ID },
      select: { payload: true },
    });
    let confrontoCount = 0;
    const scoreByKey = new Map<string, { homeGoals: number; awayGoals: number; count: number }>();
    for (const p of predictions) {
      const payload = (p.payload ?? {}) as StoredPayload;
      const predFixture = payload.bracket?.fixtures?.find((f) => f.id === fixtureId);
      if (!predFixture) continue;
      const hitConfronto =
        predFixture.topTeamCode === officialTopCode &&
        predFixture.bottomTeamCode === officialBottomCode;
      if (!hitConfronto) continue;
      confrontoCount += 1;
      const score = payload.knockoutScores?.[fixtureId];
      if (!score) continue;
      const key = `${score.homeGoals}x${score.awayGoals}`;
      const cur = scoreByKey.get(key);
      if (cur) cur.count += 1;
      else scoreByKey.set(key, { homeGoals: score.homeGoals, awayGoals: score.awayGoals, count: 1 });
    }
    const guesses = [...scoreByKey.values()].sort((a, b) => b.count - a.count);
    return { confrontoCount, guesses };
  }

  /** True quando os 72 resultados de grupo estão lançados. */
  async isGroupStageComplete(): Promise<boolean> {
    const withResult = await this.prisma.match.count({
      where: {
        competitionId: FIFA_WC_2026_ID,
        stage: 'group',
        homeGoalsOfficial: { not: null },
        awayGoalsOfficial: { not: null },
      },
    });
    return withResult >= 72;
  }
}
