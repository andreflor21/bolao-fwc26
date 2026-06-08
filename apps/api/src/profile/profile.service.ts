import { ForbiddenException, Inject, Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { REDIS_CLIENT } from '../redis/redis.tokens';
import Redis from 'ioredis';
import { FIFA_WC_2026_ID } from '@bolao/shared';

export interface ParticipantListItem {
  userId: string;
  name: string;
  points: number;
  exactScores: number;
}

export interface ParticipantHeader {
  userId: string;
  name: string;
  points: number;
  exactScores: number;
  isSelf: boolean;
}

export interface ParticipantGroupGuess {
  matchId: string;
  groupLetter: string | null;
  roundNumber: number | null;
  kickoffAt: string;
  homeTeamCode: string | null;
  awayTeamCode: string | null;
  homeTeamName: string | null;
  awayTeamName: string | null;
  homeGoalsOfficial: number | null;
  awayGoalsOfficial: number | null;
  isLocked: boolean;
  /** Palpite só é exposto quando o jogo está travado OU é o próprio dono. */
  guess: { homeGoals: number; awayGoals: number; points: number | null; ruleApplied: string | null } | null;
}

export interface ParticipantGroupGuessesResponse {
  header: ParticipantHeader;
  matches: ParticipantGroupGuess[];
}

export interface ParticipantKnockoutGuess {
  fixtureId: string;
  stage: string;
  kickoffAt: string | null;
  isLocked: boolean;
  homeTeamCodeOfficial: string | null;
  awayTeamCodeOfficial: string | null;
  homeGoalsOfficial: number | null;
  awayGoalsOfficial: number | null;
  /** Palpite do participante, exposto só após o lock OU se for o próprio dono. */
  guess:
    | {
        topTeamCode: string | null;
        bottomTeamCode: string | null;
        predictedWinnerCode: string | null;
        homeGoals: number | null;
        awayGoals: number | null;
        advancesTeamCode: string | null;
        points: number | null;
      }
    | null;
}

export interface ParticipantKnockoutGuessesResponse {
  header: ParticipantHeader;
  fixtures: ParticipantKnockoutGuess[];
  /** True quando o participante ainda não submeteu palpites de mata-mata. */
  noPayload: boolean;
}

// O `stage` na bracket payload chega em lowercase ('r32', 'final', ...) mas o
// prefixo do fixtureId vem em uppercase ('R32-73', 'F-104'). Normaliza ambos.
const KO_STAGE_ORDER: Record<string, number> = {
  r32: 0,
  R32: 0,
  r16: 1,
  R16: 1,
  qf: 2,
  QF: 2,
  sf: 3,
  SF: 3,
  tp: 4,
  TP: 4,
  final: 5,
  FINAL: 5,
  F: 5,
};

/**
 * Perfil público de um participante (somente para pagantes vê pagantes):
 * - listagem de quem está no bolão (ranking + count de placares exatos)
 * - palpites de fase de grupos jogo-a-jogo, mas só dos jogos já travados
 *   (kickoff < now() OU resultado já cadastrado); o próprio dono vê tudo.
 * - palpites do mata-mata por confronto, mesma regra de lock por fixtureId.
 */
@Injectable()
export class ProfileService {
  constructor(
    private readonly prisma: PrismaService,
    @Inject(REDIS_CLIENT) private readonly redis: Redis,
  ) {}

  async listParticipants(): Promise<ParticipantListItem[]> {
    const subs = await this.prisma.subscription.findMany({
      where: { competitionId: FIFA_WC_2026_ID, status: 'active' },
      select: { userId: true, user: { select: { name: true } } },
    });
    if (subs.length === 0) return [];

    const ids = subs.map((s) => s.userId);
    // Pontos vêm do ZSET de ranking geral (mantido pelo RankingService).
    // Placares exatos: chave bolao:exact:<userId>.
    const pipeline = this.redis.pipeline();
    for (const id of ids) pipeline.zscore('bolao:ranking:general', id);
    for (const id of ids) pipeline.get(`bolao:exact:${id}`);
    const results = await pipeline.exec();
    const scoreRows = (results ?? []).slice(0, ids.length);
    const exactRows = (results ?? []).slice(ids.length);

    const items: ParticipantListItem[] = ids.map((userId, idx) => {
      const points = Number((scoreRows[idx]?.[1] as string | null) ?? 0);
      const exactScores = Number((exactRows[idx]?.[1] as string | null) ?? 0);
      return {
        userId,
        name: subs[idx]!.user?.name ?? '—',
        points,
        exactScores,
      };
    });
    items.sort((a, b) => b.points - a.points || a.name.localeCompare(b.name, 'pt'));
    return items;
  }

  async getGroupGuesses(
    requesterId: string,
    targetUserId: string,
  ): Promise<ParticipantGroupGuessesResponse> {
    const header = await this.buildHeader(requesterId, targetUserId);
    const isSelf = requesterId === targetUserId;

    const matches = await this.prisma.match.findMany({
      where: { competitionId: FIFA_WC_2026_ID, stage: 'group' },
      orderBy: [{ roundNumber: 'asc' }, { kickoffAt: 'asc' }],
      include: {
        homeTeam: { select: { code: true, name: true } },
        awayTeam: { select: { code: true, name: true } },
      },
    });

    const guesses = await this.prisma.guess.findMany({
      where: {
        userId: targetUserId,
        match: { competitionId: FIFA_WC_2026_ID, stage: 'group' },
      },
      select: {
        matchId: true,
        homeGoals: true,
        awayGoals: true,
        score: { select: { points: true, ruleApplied: true } },
      },
    });
    const byMatch = new Map(guesses.map((g) => [g.matchId, g]));
    const now = new Date();

    return {
      header,
      matches: matches.map((m) => {
        const isLocked = m.kickoffAt <= now || m.resultLockedAt !== null;
        const reveal = isSelf || isLocked;
        const g = byMatch.get(m.id);
        return {
          matchId: m.id,
          groupLetter: m.groupLetter,
          roundNumber: m.roundNumber,
          kickoffAt: m.kickoffAt.toISOString(),
          homeTeamCode: m.homeTeam?.code ?? null,
          awayTeamCode: m.awayTeam?.code ?? null,
          homeTeamName: m.homeTeam?.name ?? null,
          awayTeamName: m.awayTeam?.name ?? null,
          homeGoalsOfficial: m.homeGoalsOfficial,
          awayGoalsOfficial: m.awayGoalsOfficial,
          isLocked,
          guess:
            reveal && g
              ? {
                  homeGoals: g.homeGoals,
                  awayGoals: g.awayGoals,
                  points: g.score?.points ?? null,
                  ruleApplied: g.score?.ruleApplied ?? null,
                }
              : null,
        };
      }),
    };
  }

  async getKnockoutGuesses(
    requesterId: string,
    targetUserId: string,
  ): Promise<ParticipantKnockoutGuessesResponse> {
    const header = await this.buildHeader(requesterId, targetUserId);
    const isSelf = requesterId === targetUserId;

    const prediction = await this.prisma.bracketPrediction.findUnique({
      where: {
        userId_competitionId: {
          userId: targetUserId,
          competitionId: FIFA_WC_2026_ID,
        },
      },
      select: { payload: true },
    });

    const koMatches = await this.prisma.match.findMany({
      where: { competitionId: FIFA_WC_2026_ID, NOT: { stage: 'group' } },
      orderBy: [{ stage: 'asc' }, { kickoffAt: 'asc' }],
      include: {
        homeTeam: { select: { code: true } },
        awayTeam: { select: { code: true } },
      },
    });

    // Mapeia fixtureId -> Match para resolver lock e resultado oficial.
    const matchByFixture = new Map<string, (typeof koMatches)[number]>();
    for (const m of koMatches) {
      if (m.bracketFixtureId) matchByFixture.set(m.bracketFixtureId, m);
    }

    const koScores = await this.prisma.knockoutGuessScore.findMany({
      where: { userId: targetUserId, competitionId: FIFA_WC_2026_ID },
      select: { fixtureId: true, points: true },
    });
    const pointsByFixture = new Map(koScores.map((s) => [s.fixtureId, s.points]));

    if (!prediction) {
      // Sem palpite de mata-mata enviado — devolve só os fixtures travados
      // com o estado oficial, sem a coluna de palpite.
      const now = new Date();
      const fixtures: ParticipantKnockoutGuess[] = [];
      for (const m of koMatches) {
        if (!m.bracketFixtureId) continue;
        const isLocked = m.kickoffAt <= now || m.resultLockedAt !== null;
        fixtures.push({
          fixtureId: m.bracketFixtureId,
          stage: m.stage,
          kickoffAt: m.kickoffAt.toISOString(),
          isLocked,
          homeTeamCodeOfficial: m.homeTeam?.code ?? null,
          awayTeamCodeOfficial: m.awayTeam?.code ?? null,
          homeGoalsOfficial: m.homeGoalsOfficial,
          awayGoalsOfficial: m.awayGoalsOfficial,
          guess: null,
        });
      }
      fixtures.sort(this.sortByStageThenFixture);
      return { header, fixtures, noPayload: true };
    }

    const payload = prediction.payload as {
      bracket?: {
        fixtures?: Array<{
          id: string;
          stage: string;
          topTeamCode: string | null;
          bottomTeamCode: string | null;
          predictedWinnerCode: string | null;
        }>;
      };
      knockoutScores?: Record<
        string,
        { homeGoals: number; awayGoals: number; advancesTeamCode?: string | null }
      >;
    };

    const bracketFixtures = payload.bracket?.fixtures ?? [];
    const koScoresMap = payload.knockoutScores ?? {};
    const now = new Date();

    const fixtures: ParticipantKnockoutGuess[] = bracketFixtures.map((f) => {
      const m = matchByFixture.get(f.id);
      const isLocked = m ? m.kickoffAt <= now || m.resultLockedAt !== null : false;
      const reveal = isSelf || isLocked;
      const scoreEntry = koScoresMap[f.id];
      return {
        fixtureId: f.id,
        stage: f.stage,
        kickoffAt: m?.kickoffAt.toISOString() ?? null,
        isLocked,
        homeTeamCodeOfficial: m?.homeTeam?.code ?? null,
        awayTeamCodeOfficial: m?.awayTeam?.code ?? null,
        homeGoalsOfficial: m?.homeGoalsOfficial ?? null,
        awayGoalsOfficial: m?.awayGoalsOfficial ?? null,
        guess: reveal
          ? {
              topTeamCode: f.topTeamCode,
              bottomTeamCode: f.bottomTeamCode,
              predictedWinnerCode: f.predictedWinnerCode,
              homeGoals: scoreEntry?.homeGoals ?? null,
              awayGoals: scoreEntry?.awayGoals ?? null,
              advancesTeamCode: scoreEntry?.advancesTeamCode ?? null,
              points: pointsByFixture.get(f.id) ?? null,
            }
          : null,
      };
    });
    fixtures.sort(this.sortByStageThenFixture);
    return { header, fixtures, noPayload: false };
  }

  private sortByStageThenFixture = (a: ParticipantKnockoutGuess, b: ParticipantKnockoutGuess) => {
    const sa = KO_STAGE_ORDER[a.stage.toUpperCase()] ?? 99;
    const sb = KO_STAGE_ORDER[b.stage.toUpperCase()] ?? 99;
    if (sa !== sb) return sa - sb;
    // Ordena pelo número do fixture (R32-73, R32-74, ...).
    const na = Number(a.fixtureId.split('-')[1] ?? 0);
    const nb = Number(b.fixtureId.split('-')[1] ?? 0);
    return na - nb;
  };

  private async buildHeader(
    requesterId: string,
    targetUserId: string,
  ): Promise<ParticipantHeader> {
    const [target, requesterSub, targetSub, points, exact] = await Promise.all([
      this.prisma.user.findUnique({
        where: { id: targetUserId },
        select: { id: true, name: true },
      }),
      this.prisma.subscription.findUnique({
        where: {
          userId_competitionId: { userId: requesterId, competitionId: FIFA_WC_2026_ID },
        },
        select: { status: true },
      }),
      this.prisma.subscription.findUnique({
        where: {
          userId_competitionId: { userId: targetUserId, competitionId: FIFA_WC_2026_ID },
        },
        select: { status: true },
      }),
      this.redis.zscore('bolao:ranking:general', targetUserId),
      this.redis.get(`bolao:exact:${targetUserId}`),
    ]);

    if (!target) throw new NotFoundException('Participante não encontrado');
    if (!requesterSub || requesterSub.status !== 'active') {
      throw new ForbiddenException('Apenas participantes pagantes podem ver os perfis');
    }
    if (!targetSub || targetSub.status !== 'active') {
      throw new NotFoundException('Esse participante não está mais no bolão');
    }

    return {
      userId: target.id,
      name: target.name,
      points: Number(points ?? 0),
      exactScores: Number(exact ?? 0),
      isSelf: requesterId === targetUserId,
    };
  }
}
