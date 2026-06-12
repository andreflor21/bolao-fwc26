import { BadRequestException, Injectable, Logger, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { AdminMatchService } from '../admin/admin-match.service';
import { BroadcastAIService, BroadcastDraft, BroadcastPresetKey } from './broadcast-ai.service';
import { WhatsappService } from './whatsapp.service';
import { FIFA_WC_2026_ID } from '@bolao/shared';

/** Janela para "jogos das próximas X horas" no preset de lembrete. */
const REMINDER_WINDOW_HOURS = 6;

export interface BroadcastPreviewResult extends BroadcastDraft {
  /** Driver efetivo do WhatsApp (mock/evolution) — UI mostra "modo teste". */
  whatsappDriver: 'mock' | 'evolution';
  /** Contexto cru usado pela IA, útil pra debug visual / tooltip. */
  context: unknown;
}

export interface BroadcastSendResult {
  id: string;
  status: 'sent' | 'failed';
  providerId: string | null;
  errorMessage: string | null;
}

export interface BroadcastHistoryItem {
  id: string;
  presetKey: string | null;
  text: string;
  status: string;
  providerId: string | null;
  errorMessage: string | null;
  sentByUserId: string;
  sentByName: string;
  createdAt: string;
}

const BRT_DATETIME = new Intl.DateTimeFormat('pt-BR', {
  timeZone: 'America/Sao_Paulo',
  weekday: 'short',
  hour: '2-digit',
  minute: '2-digit',
});

/**
 * Orquestra os disparos do admin no grupo do WhatsApp:
 *  1) Coleta contexto de domínio (jogo de hoje, distribuição de palpites, etc.)
 *  2) Pede ao Claude pra montar a frase no tom do grupo (BroadcastAIService)
 *  3) Admin edita e dá ok
 *  4) Envia via WhatsappService e persiste log de auditoria
 *
 * Os presets ficam num map de funções `collect*` — adicionar novo preset é
 * só criar a função coletora e registrar aqui (não toca o controller nem a UI).
 */
@Injectable()
export class BroadcastService {
  private readonly logger = new Logger(BroadcastService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly adminMatch: AdminMatchService,
    private readonly ai: BroadcastAIService,
    private readonly whatsapp: WhatsappService,
  ) {}

  async preview(
    presetKey: BroadcastPresetKey,
    matchId?: string,
    liveScore?: { homeGoals: number; awayGoals: number },
  ): Promise<BroadcastPreviewResult> {
    const context = await this.collectContext(presetKey, matchId, liveScore);
    const draft = await this.ai.generate(presetKey, context);
    return {
      ...draft,
      whatsappDriver: this.whatsapp.getDriver(),
      context,
    };
  }

  async send(userId: string, text: string, presetKey?: string): Promise<BroadcastSendResult> {
    const trimmed = text.trim();
    if (!trimmed) throw new BadRequestException('Mensagem vazia');
    let result: BroadcastSendResult;
    try {
      const { messageId } = await this.whatsapp.sendText(trimmed);
      const row = await this.prisma.broadcastLog.create({
        data: {
          presetKey: presetKey ?? null,
          text: trimmed,
          status: 'sent',
          providerId: messageId || null,
          sentByUserId: userId,
        },
      });
      result = {
        id: row.id,
        status: 'sent',
        providerId: row.providerId,
        errorMessage: null,
      };
      this.logger.log(`Broadcast ${row.id} enviado por ${userId} (preset=${presetKey ?? 'n/a'})`);
    } catch (e) {
      const errorMessage = (e as Error).message.slice(0, 500);
      const row = await this.prisma.broadcastLog.create({
        data: {
          presetKey: presetKey ?? null,
          text: trimmed,
          status: 'failed',
          errorMessage,
          sentByUserId: userId,
        },
      });
      result = {
        id: row.id,
        status: 'failed',
        providerId: null,
        errorMessage,
      };
      this.logger.warn(`Broadcast falhou: ${errorMessage}`);
    }
    return result;
  }

  async history(limit = 20): Promise<BroadcastHistoryItem[]> {
    const safeLimit = Math.max(1, Math.min(limit, 100));
    const rows = await this.prisma.broadcastLog.findMany({
      orderBy: { createdAt: 'desc' },
      take: safeLimit,
      include: { sentBy: { select: { name: true } } },
    });
    return rows.map((r) => ({
      id: r.id,
      presetKey: r.presetKey,
      text: r.text,
      status: r.status,
      providerId: r.providerId,
      errorMessage: r.errorMessage,
      sentByUserId: r.sentByUserId,
      sentByName: r.sentBy?.name ?? '—',
      createdAt: r.createdAt.toISOString(),
    }));
  }

  // -------- Context collectors --------

  private async collectContext(
    presetKey: BroadcastPresetKey,
    matchId?: string,
    liveScore?: { homeGoals: number; awayGoals: number },
  ): Promise<unknown> {
    switch (presetKey) {
      case 'top-guesses-today':
        return this.collectTopGuesses(matchId);
      case 'win-draw-probabilities':
        return this.collectProbabilities(matchId);
      case 'match-result-recap':
        return this.collectResultRecap(matchId);
      case 'reminder-lock-soon':
        return this.collectReminder();
      case 'who-is-nailing':
        if (!liveScore) {
          throw new BadRequestException('Informe o placar atual do jogo (homeGoals e awayGoals).');
        }
        return this.collectWhoIsNailing(matchId, liveScore.homeGoals, liveScore.awayGoals);
      default:
        throw new BadRequestException(`Preset desconhecido: ${presetKey}`);
    }
  }

  /** Resolve o "jogo alvo": matchId explícito > próximo kickoff futuro. */
  private async resolveTargetMatch(matchId?: string) {
    if (matchId) {
      const m = await this.prisma.match.findUnique({
        where: { id: matchId },
        include: {
          homeTeam: { select: { code: true, name: true } },
          awayTeam: { select: { code: true, name: true } },
        },
      });
      if (!m) throw new NotFoundException(`Jogo ${matchId} não encontrado`);
      return m;
    }
    const m = await this.prisma.match.findFirst({
      where: {
        competitionId: FIFA_WC_2026_ID,
        kickoffAt: { gte: new Date() },
        homeGoalsOfficial: null,
      },
      orderBy: { kickoffAt: 'asc' },
      include: {
        homeTeam: { select: { code: true, name: true } },
        awayTeam: { select: { code: true, name: true } },
      },
    });
    if (!m) throw new NotFoundException('Nenhum jogo futuro encontrado.');
    return m;
  }

  private async collectTopGuesses(matchId?: string) {
    const match = await this.resolveTargetMatch(matchId);
    const distribution = await this.adminMatch.guessDistribution(match.id);
    const total = distribution.reduce((s, d) => s + d.count, 0);
    return {
      matchId: match.id,
      homeTeamCode: match.homeTeam?.code ?? null,
      awayTeamCode: match.awayTeam?.code ?? null,
      homeTeamName: match.homeTeam?.name ?? null,
      awayTeamName: match.awayTeam?.name ?? null,
      kickoffLabel: BRT_DATETIME.format(match.kickoffAt),
      totalGuesses: total,
      // Todos os placares palpitados, do mais escolhido pro menos (não só o top 5).
      guesses: distribution,
    };
  }

  /**
   * "Quem está cravando o placar atual" — o admin informa o placar do jogo no
   * momento do disparo e listamos os participantes cujo palpite bate exatamente
   * com esse placar. Diferente dos outros presets, este cita nomes.
   */
  private async collectWhoIsNailing(matchId: string | undefined, homeGoals: number, awayGoals: number) {
    const match = await this.resolveTargetMatch(matchId);
    const guesses = await this.prisma.guess.findMany({
      where: { matchId: match.id, homeGoals, awayGoals },
      select: { user: { select: { name: true } } },
    });
    const nailers = guesses
      .map((g) => g.user?.name?.trim())
      .filter((n): n is string => Boolean(n))
      .sort((a, b) => a.localeCompare(b, 'pt'));
    return {
      matchId: match.id,
      homeTeamCode: match.homeTeam?.code ?? null,
      awayTeamCode: match.awayTeam?.code ?? null,
      homeTeamName: match.homeTeam?.name ?? null,
      awayTeamName: match.awayTeam?.name ?? null,
      homeGoals,
      awayGoals,
      nailers,
      count: nailers.length,
    };
  }

  private async collectProbabilities(matchId?: string) {
    const match = await this.resolveTargetMatch(matchId);
    const distribution = await this.adminMatch.guessDistribution(match.id);
    const total = distribution.reduce((s, d) => s + d.count, 0);
    let homeWins = 0;
    let draws = 0;
    let awayWins = 0;
    for (const g of distribution) {
      if (g.homeGoals > g.awayGoals) homeWins += g.count;
      else if (g.homeGoals < g.awayGoals) awayWins += g.count;
      else draws += g.count;
    }
    const pct = (n: number) => (total === 0 ? 0 : (n * 100) / total);
    return {
      matchId: match.id,
      homeTeamCode: match.homeTeam?.code ?? null,
      awayTeamCode: match.awayTeam?.code ?? null,
      homeTeamName: match.homeTeam?.name ?? null,
      awayTeamName: match.awayTeam?.name ?? null,
      kickoffLabel: BRT_DATETIME.format(match.kickoffAt),
      totalGuesses: total,
      homeWinPct: Number(pct(homeWins).toFixed(1)),
      drawPct: Number(pct(draws).toFixed(1)),
      awayWinPct: Number(pct(awayWins).toFixed(1)),
    };
  }

  private async collectResultRecap(matchId?: string) {
    // Para o recap, exigimos um matchId (não faz sentido "jogo de hoje" aqui).
    // Se não veio, pega o último jogo com resultado oficial cadastrado.
    let match;
    if (matchId) {
      match = await this.prisma.match.findUnique({
        where: { id: matchId },
        include: {
          homeTeam: { select: { code: true, name: true } },
          awayTeam: { select: { code: true, name: true } },
        },
      });
      if (!match) throw new NotFoundException(`Jogo ${matchId} não encontrado`);
    } else {
      match = await this.prisma.match.findFirst({
        where: {
          competitionId: FIFA_WC_2026_ID,
          homeGoalsOfficial: { not: null },
        },
        orderBy: { resultLockedAt: 'desc' },
        include: {
          homeTeam: { select: { code: true, name: true } },
          awayTeam: { select: { code: true, name: true } },
        },
      });
      if (!match) throw new NotFoundException('Ainda não há resultado oficial registrado.');
    }
    if (match.homeGoalsOfficial == null || match.awayGoalsOfficial == null) {
      throw new BadRequestException('Esse jogo ainda não tem resultado oficial registrado.');
    }
    const exactGroup = await this.prisma.guess.findMany({
      where: {
        matchId: match.id,
        homeGoals: match.homeGoalsOfficial,
        awayGoals: match.awayGoalsOfficial,
      },
      select: { id: true },
    });
    return {
      matchId: match.id,
      homeTeamCode: match.homeTeam?.code ?? null,
      awayTeamCode: match.awayTeam?.code ?? null,
      homeTeamName: match.homeTeam?.name ?? null,
      awayTeamName: match.awayTeam?.name ?? null,
      homeGoalsOfficial: match.homeGoalsOfficial,
      awayGoalsOfficial: match.awayGoalsOfficial,
      exactScoreCount: exactGroup.length,
    };
  }

  private async collectReminder() {
    const now = new Date();
    const until = new Date(now.getTime() + REMINDER_WINDOW_HOURS * 60 * 60 * 1000);
    const matches = await this.prisma.match.findMany({
      where: {
        competitionId: FIFA_WC_2026_ID,
        kickoffAt: { gte: now, lte: until },
      },
      orderBy: { kickoffAt: 'asc' },
      take: 5,
      include: {
        homeTeam: { select: { code: true, name: true } },
        awayTeam: { select: { code: true, name: true } },
      },
    });
    return {
      windowHours: REMINDER_WINDOW_HOURS,
      fixtures: matches.map((m) => ({
        matchId: m.id,
        label: `${m.homeTeam?.name ?? m.homeTeam?.code ?? '?'} x ${m.awayTeam?.name ?? m.awayTeam?.code ?? '?'}`,
        kickoffLabel: BRT_DATETIME.format(m.kickoffAt),
      })),
    };
  }
}
