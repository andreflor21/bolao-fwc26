import { BadRequestException, Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { WhatsappService, normalizePhone } from './whatsapp.service';
import { FIFA_WC_2026_ID } from '@bolao/shared';

export interface InviteCandidate {
  userId: string;
  name: string;
  whatsapp: string | null;
  whatsappNormalized: string | null;
  /** Última tentativa de convite (qualquer status). */
  lastInvitedAt: string | null;
  /** Status do último convite ('added', 'dm_sent', 'failed', null se nunca). */
  lastInviteStatus: 'added' | 'dm_sent' | 'failed' | null;
}

export interface InviteResultPerUser {
  userId: string;
  name: string;
  outcome: 'added' | 'dm_sent' | 'failed' | 'skipped';
  reason?: string;
}

export interface SendInvitesResult {
  total: number;
  added: number;
  dmSent: number;
  failed: number;
  skipped: number;
  groupInviteUrl: string;
  whatsappDriver: 'mock' | 'evolution';
  results: InviteResultPerUser[];
}

const DEFAULT_TEMPLATE = `Oi {nome}! 👋

Você marcou no app que quer participar do grupo do bolão da Copa do Mundo 2026 no WhatsApp.

Entra pelo link: {linkConvite}

Lá a gente compartilha os palpites mais jogados, % de vitória/empate e a zoeira da galera. Bora! ⚽🏆`;

/**
 * Convite pro grupo do WhatsApp:
 *  1) Lista usuários com subscription ativa + opt-in marcado + WhatsApp preenchido.
 *  2) Para cada um: tenta adicionar direto via Evolution (`updateParticipant action=add`).
 *  3) Quem não foi adicionado (privacidade) recebe DM com o link do grupo.
 *  4) Tudo é logado em `BroadcastLog` (preset 'group-invite-add' ou 'group-invite-dm')
 *     com `targetUserId` preenchido — admin vê quem já foi contactado.
 */
@Injectable()
export class GroupInviteService {
  private readonly logger = new Logger(GroupInviteService.name);
  private static readonly PRESET_ADD = 'group-invite-add';
  private static readonly PRESET_DM = 'group-invite-dm';
  private static readonly PRESET_FAILED = 'group-invite-failed';

  constructor(
    private readonly prisma: PrismaService,
    private readonly whatsapp: WhatsappService,
  ) {}

  async listCandidates(): Promise<InviteCandidate[]> {
    const subs = await this.prisma.subscription.findMany({
      where: { competitionId: FIFA_WC_2026_ID, status: 'active' },
      select: {
        userId: true,
        user: {
          select: { id: true, name: true, whatsapp: true, whatsappGroupOptIn: true },
        },
      },
    });
    const eligibleUsers = subs
      .map((s) => s.user)
      .filter((u) => u.whatsappGroupOptIn && (u.whatsapp ?? '').trim().length > 0);

    if (eligibleUsers.length === 0) return [];

    const userIds = eligibleUsers.map((u) => u.id);
    // Pega o último log de convite por usuário pra mostrar status.
    const recentLogs = await this.prisma.broadcastLog.findMany({
      where: {
        targetUserId: { in: userIds },
        presetKey: {
          in: [
            GroupInviteService.PRESET_ADD,
            GroupInviteService.PRESET_DM,
            GroupInviteService.PRESET_FAILED,
          ],
        },
      },
      orderBy: { createdAt: 'desc' },
      select: { targetUserId: true, presetKey: true, status: true, createdAt: true },
    });
    const lastByUser = new Map<string, (typeof recentLogs)[number]>();
    for (const log of recentLogs) {
      if (log.targetUserId && !lastByUser.has(log.targetUserId)) {
        lastByUser.set(log.targetUserId, log);
      }
    }

    return eligibleUsers
      .map((u): InviteCandidate => {
        const last = lastByUser.get(u.id);
        let lastInviteStatus: InviteCandidate['lastInviteStatus'] = null;
        if (last) {
          if (last.presetKey === GroupInviteService.PRESET_ADD) lastInviteStatus = 'added';
          else if (last.presetKey === GroupInviteService.PRESET_DM) lastInviteStatus = 'dm_sent';
          else lastInviteStatus = 'failed';
        }
        return {
          userId: u.id,
          name: u.name,
          whatsapp: u.whatsapp,
          whatsappNormalized: u.whatsapp ? normalizePhone(u.whatsapp) : null,
          lastInvitedAt: last ? last.createdAt.toISOString() : null,
          lastInviteStatus,
        };
      })
      .sort((a, b) => {
        // Não-convidados primeiro, depois por nome.
        if (a.lastInvitedAt === null && b.lastInvitedAt !== null) return -1;
        if (a.lastInvitedAt !== null && b.lastInvitedAt === null) return 1;
        return a.name.localeCompare(b.name, 'pt');
      });
  }

  async sendInvites(
    adminUserId: string,
    userIds: string[],
    templateRaw: string | undefined,
    tryAddDirect: boolean,
  ): Promise<SendInvitesResult> {
    if (userIds.length === 0) throw new BadRequestException('Selecione ao menos um usuário.');
    const template = (templateRaw && templateRaw.trim().length > 0 ? templateRaw : DEFAULT_TEMPLATE);

    // Carrega usuários e filtra os elegíveis (mantém só com whatsapp + opt-in + sub ativa).
    const subs = await this.prisma.subscription.findMany({
      where: {
        competitionId: FIFA_WC_2026_ID,
        status: 'active',
        userId: { in: userIds },
      },
      select: {
        userId: true,
        user: { select: { id: true, name: true, whatsapp: true, whatsappGroupOptIn: true } },
      },
    });
    const eligible = subs
      .map((s) => s.user)
      .filter((u) => u.whatsappGroupOptIn && (u.whatsapp ?? '').trim().length > 0);

    // Marca quem foi descartado.
    const eligibleIds = new Set(eligible.map((u) => u.id));
    const skipped: InviteResultPerUser[] = userIds
      .filter((id) => !eligibleIds.has(id))
      .map((id) => ({
        userId: id,
        name: '—',
        outcome: 'skipped' as const,
        reason: 'Sem opt-in, sem WhatsApp ou sem inscrição ativa.',
      }));

    if (eligible.length === 0) {
      return {
        total: userIds.length,
        added: 0,
        dmSent: 0,
        failed: 0,
        skipped: skipped.length,
        groupInviteUrl: '',
        whatsappDriver: this.whatsapp.getDriver(),
        results: skipped,
      };
    }

    // Pega o link do grupo uma vez só.
    const inviteUrl = await this.whatsapp.getGroupInviteUrl();

    // Mapa de número-normalizado → user (pra cruzar resposta do Evolution).
    const numberToUser = new Map<string, (typeof eligible)[number]>();
    const invalidPhone: InviteResultPerUser[] = [];
    for (const u of eligible) {
      const normalized = normalizePhone(u.whatsapp ?? '');
      if (!normalized) {
        invalidPhone.push({
          userId: u.id,
          name: u.name,
          outcome: 'failed',
          reason: `Número inválido: "${u.whatsapp ?? ''}"`,
        });
        continue;
      }
      numberToUser.set(normalized, u);
    }
    for (const f of invalidPhone) {
      // invalidPhone só contém outcome='failed' por construção; reassere pro TS.
      await this.logResult(adminUserId, f.userId, 'failed', f.reason ?? null, '');
    }

    const numbers = Array.from(numberToUser.keys());

    // 1) Tenta adicionar direto (opcional). Quem voltou added=false vai pra DM.
    let addResults: Array<{ number: string; added: boolean; status: string; message?: string }> = [];
    if (tryAddDirect && numbers.length > 0) {
      try {
        addResults = await this.whatsapp.addParticipantsToGroup(numbers);
      } catch (e) {
        this.logger.warn(`addParticipantsToGroup falhou em lote: ${(e as Error).message}`);
        // Cai pra DM em todos.
        addResults = numbers.map((n) => ({
          number: n,
          added: false,
          status: 'error',
          message: (e as Error).message,
        }));
      }
    } else {
      addResults = numbers.map((n) => ({ number: n, added: false, status: 'skipped' }));
    }

    const addedNumbers = new Set(addResults.filter((r) => r.added).map((r) => r.number));
    const results: InviteResultPerUser[] = [...invalidPhone];

    // Loga adições bem-sucedidas.
    for (const r of addResults) {
      if (!r.added) continue;
      const user = numberToUser.get(r.number);
      if (!user) continue;
      results.push({ userId: user.id, name: user.name, outcome: 'added' });
      await this.logResult(adminUserId, user.id, 'added', null, `Adicionado direto ao grupo (${inviteUrl})`);
    }

    // 2) Fallback DM para quem não foi adicionado.
    for (const number of numbers) {
      if (addedNumbers.has(number)) continue;
      const user = numberToUser.get(number);
      if (!user) continue;
      const text = renderTemplate(template, { nome: user.name, linkConvite: inviteUrl });
      try {
        await this.whatsapp.sendTextTo(number, text);
        results.push({ userId: user.id, name: user.name, outcome: 'dm_sent' });
        await this.logResult(adminUserId, user.id, 'dm_sent', null, text);
      } catch (e) {
        const reason = (e as Error).message;
        results.push({ userId: user.id, name: user.name, outcome: 'failed', reason });
        await this.logResult(adminUserId, user.id, 'failed', reason, text);
      }
    }

    const summary = {
      total: userIds.length,
      added: results.filter((r) => r.outcome === 'added').length,
      dmSent: results.filter((r) => r.outcome === 'dm_sent').length,
      failed: results.filter((r) => r.outcome === 'failed').length,
      skipped: skipped.length,
      groupInviteUrl: inviteUrl,
      whatsappDriver: this.whatsapp.getDriver(),
      results: [...skipped, ...results],
    };
    this.logger.log(
      `Convites: total=${summary.total} added=${summary.added} dm=${summary.dmSent} failed=${summary.failed} skipped=${summary.skipped}`,
    );
    return summary;
  }

  private async logResult(
    adminUserId: string,
    targetUserId: string,
    outcome: 'added' | 'dm_sent' | 'failed',
    errorMessage: string | null,
    text: string,
  ): Promise<void> {
    const presetKey =
      outcome === 'added'
        ? GroupInviteService.PRESET_ADD
        : outcome === 'dm_sent'
          ? GroupInviteService.PRESET_DM
          : GroupInviteService.PRESET_FAILED;
    await this.prisma.broadcastLog.create({
      data: {
        presetKey,
        text: text.slice(0, 4000),
        status: outcome === 'failed' ? 'failed' : 'sent',
        errorMessage: errorMessage ? errorMessage.slice(0, 500) : null,
        sentByUserId: adminUserId,
        targetUserId,
      },
    });
  }
}

function renderTemplate(template: string, vars: Record<string, string>): string {
  return template.replace(/\{(\w+)\}/g, (_, key) => vars[key] ?? `{${key}}`);
}
