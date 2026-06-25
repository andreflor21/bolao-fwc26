import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { nanoid } from 'nanoid';
import { PrismaService } from '../prisma/prisma.service';
import {
  FIFA_WC_2026_ID,
  MAX_SIDE_POOLS_PER_OWNER,
  DEFAULT_SIDE_POOL_MAX_MEMBERS,
} from '@bolao/shared';
import type { CreateSidePoolDto } from './dto/create-side-pool.dto';
import { RankingService } from '../ranking/ranking.service';

@Injectable()
export class SidePoolService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly ranking: RankingService,
  ) {}

  async create(userId: string, dto: CreateSidePoolDto) {
    const ownedCount = await this.prisma.sidePool.count({
      where: { ownerUserId: userId, competitionId: FIFA_WC_2026_ID },
    });
    if (ownedCount >= MAX_SIDE_POOLS_PER_OWNER) {
      throw new ConflictException(
        `You reached the limit of ${MAX_SIDE_POOLS_PER_OWNER} side pools per player`,
      );
    }

    const inviteToken = nanoid(16);
    const sidePool = await this.prisma.sidePool.create({
      data: {
        ownerUserId: userId,
        competitionId: FIFA_WC_2026_ID,
        name: dto.name,
        description: dto.description ?? null,
        maxMembers: dto.maxMembers ?? DEFAULT_SIDE_POOL_MAX_MEMBERS,
        inviteToken,
        members: {
          create: { userId },
        },
      },
    });
    // Carrega a pontuação atual do dono no ZSET do novo bolão.
    await this.ranking.recomputeForUser(userId);
    return this.toDto(sidePool.id);
  }

  async listMine(userId: string) {
    const memberships = await this.prisma.sidePoolMember.findMany({
      where: { userId },
      include: {
        sidePool: {
          include: { _count: { select: { members: true } } },
        },
      },
      orderBy: { joinedAt: 'desc' },
    });
    return memberships.map((m) => ({
      id: m.sidePool.id,
      name: m.sidePool.name,
      description: m.sidePool.description,
      ownerUserId: m.sidePool.ownerUserId,
      maxMembers: m.sidePool.maxMembers,
      memberCount: m.sidePool._count.members,
      isOwner: m.sidePool.ownerUserId === userId,
      joinedAt: m.joinedAt,
      createdAt: m.sidePool.createdAt,
    }));
  }

  async getOne(userId: string, sidePoolId: string) {
    const sidePool = await this.prisma.sidePool.findUnique({
      where: { id: sidePoolId },
      include: {
        members: {
          include: { user: { select: { id: true, name: true } } },
          orderBy: { joinedAt: 'asc' },
        },
      },
    });
    if (!sidePool) throw new NotFoundException('Side pool not found');

    const isMember = sidePool.members.some((m) => m.userId === userId);
    if (!isMember) throw new ForbiddenException('You are not a member of this side pool');

    return {
      id: sidePool.id,
      name: sidePool.name,
      description: sidePool.description,
      ownerUserId: sidePool.ownerUserId,
      maxMembers: sidePool.maxMembers,
      memberCount: sidePool.members.length,
      createdAt: sidePool.createdAt,
      members: sidePool.members.map((m) => ({
        id: m.id,
        userId: m.userId,
        name: m.user.name,
        joinedAt: m.joinedAt,
      })),
    };
  }

  async getInvite(userId: string, sidePoolId: string) {
    const sidePool = await this.prisma.sidePool.findUnique({
      where: { id: sidePoolId },
      select: { ownerUserId: true, inviteToken: true, name: true },
    });
    if (!sidePool) throw new NotFoundException('Side pool not found');
    if (sidePool.ownerUserId !== userId) {
      throw new ForbiddenException('Only the owner can fetch the invite token');
    }
    return { inviteToken: sidePool.inviteToken, name: sidePool.name };
  }

  async joinByToken(userId: string, token: string) {
    const sidePool = await this.prisma.sidePool.findUnique({
      where: { inviteToken: token },
      include: { _count: { select: { members: true } } },
    });
    if (!sidePool) throw new NotFoundException('Invalid invite token');

    const alreadyMember = await this.prisma.sidePoolMember.findUnique({
      where: { sidePoolId_userId: { sidePoolId: sidePool.id, userId } },
    });
    if (alreadyMember) {
      return { sidePoolId: sidePool.id, alreadyMember: true };
    }
    if (sidePool._count.members >= sidePool.maxMembers) {
      throw new BadRequestException('Side pool is full');
    }
    await this.prisma.sidePoolMember.create({
      data: { sidePoolId: sidePool.id, userId },
    });
    // Carrega a pontuação atual do jogador no ZSET deste bolão.
    await this.ranking.recomputeForUser(userId);
    return { sidePoolId: sidePool.id, alreadyMember: false };
  }

  // ----------------------------- Convites -----------------------------

  /** Garante que `userId` é membro do bolão; devolve o pool (com contagem). */
  private async assertMembership(userId: string, sidePoolId: string) {
    const sidePool = await this.prisma.sidePool.findUnique({
      where: { id: sidePoolId },
      include: { _count: { select: { members: true } } },
    });
    if (!sidePool) throw new NotFoundException('Side pool not found');
    const isMember = await this.prisma.sidePoolMember.findUnique({
      where: { sidePoolId_userId: { sidePoolId, userId } },
    });
    if (!isMember) throw new ForbiddenException('You are not a member of this side pool');
    return sidePool;
  }

  /**
   * Convida um participante para um bolão paralelo. Qualquer membro do bolão
   * pode convidar (não só o dono). Idempotente: convidar de novo apenas
   * atualiza quem convidou.
   */
  async invite(inviterId: string, sidePoolId: string, inviteeUserId: string) {
    if (inviterId === inviteeUserId) {
      throw new BadRequestException('You cannot invite yourself');
    }
    const sidePool = await this.assertMembership(inviterId, sidePoolId);

    const inviteeSub = await this.prisma.subscription.findUnique({
      where: {
        userId_competitionId: { userId: inviteeUserId, competitionId: FIFA_WC_2026_ID },
      },
      select: { status: true },
    });
    if (!inviteeSub || inviteeSub.status !== 'active') {
      throw new BadRequestException('Esse participante ainda não está no bolão geral');
    }

    const alreadyMember = await this.prisma.sidePoolMember.findUnique({
      where: { sidePoolId_userId: { sidePoolId, userId: inviteeUserId } },
    });
    if (alreadyMember) {
      throw new ConflictException('Esse participante já está nesse bolão');
    }
    if (sidePool._count.members >= sidePool.maxMembers) {
      throw new BadRequestException('Side pool is full');
    }

    const invite = await this.prisma.sidePoolInvite.upsert({
      where: { sidePoolId_inviteeUserId: { sidePoolId, inviteeUserId } },
      update: { invitedByUserId: inviterId },
      create: { sidePoolId, inviteeUserId, invitedByUserId: inviterId },
    });
    return { inviteId: invite.id };
  }

  /** Convites pendentes recebidos pelo usuário logado (viram badge no nome). */
  async listReceivedInvites(userId: string) {
    const invites = await this.prisma.sidePoolInvite.findMany({
      where: { inviteeUserId: userId },
      include: {
        sidePool: { include: { _count: { select: { members: true } } } },
        invitedBy: { select: { name: true } },
      },
      orderBy: { createdAt: 'desc' },
    });
    return invites.map((i) => ({
      inviteId: i.id,
      sidePoolId: i.sidePoolId,
      sidePoolName: i.sidePool.name,
      invitedByName: i.invitedBy.name,
      memberCount: i.sidePool._count.members,
      maxMembers: i.sidePool.maxMembers,
      createdAt: i.createdAt,
    }));
  }

  /** O convidado aceita: entra no bolão e o convite é consumido. */
  async acceptInvite(userId: string, inviteId: string) {
    const invite = await this.prisma.sidePoolInvite.findUnique({
      where: { id: inviteId },
      include: { sidePool: { include: { _count: { select: { members: true } } } } },
    });
    if (!invite || invite.inviteeUserId !== userId) {
      throw new NotFoundException('Convite não encontrado');
    }

    const alreadyMember = await this.prisma.sidePoolMember.findUnique({
      where: { sidePoolId_userId: { sidePoolId: invite.sidePoolId, userId } },
    });
    if (alreadyMember) {
      await this.prisma.sidePoolInvite.delete({ where: { id: inviteId } });
      return { sidePoolId: invite.sidePoolId, alreadyMember: true };
    }
    if (invite.sidePool._count.members >= invite.sidePool.maxMembers) {
      throw new BadRequestException('Side pool is full');
    }

    await this.prisma.$transaction([
      this.prisma.sidePoolMember.create({
        data: { sidePoolId: invite.sidePoolId, userId },
      }),
      this.prisma.sidePoolInvite.delete({ where: { id: inviteId } }),
    ]);
    // Carrega a pontuação atual do jogador no ZSET deste bolão.
    await this.ranking.recomputeForUser(userId);
    return { sidePoolId: invite.sidePoolId, alreadyMember: false };
  }

  /**
   * Recusa (pelo convidado) ou cancela (por qualquer membro do bolão). Em ambos
   * os casos o convite some.
   */
  async declineInvite(userId: string, inviteId: string) {
    const invite = await this.prisma.sidePoolInvite.findUnique({
      where: { id: inviteId },
      select: { id: true, inviteeUserId: true, sidePoolId: true },
    });
    if (!invite) throw new NotFoundException('Convite não encontrado');

    if (invite.inviteeUserId !== userId) {
      // Não é o convidado — só permite cancelar se for membro do bolão.
      const isMember = await this.prisma.sidePoolMember.findUnique({
        where: { sidePoolId_userId: { sidePoolId: invite.sidePoolId, userId } },
      });
      if (!isMember) throw new ForbiddenException('Sem permissão para cancelar este convite');
    }

    await this.prisma.sidePoolInvite.delete({ where: { id: inviteId } });
    return { ok: true };
  }

  /**
   * Para a tela de perfil: bolões paralelos do `viewer` e o estado de cada um em
   * relação ao `target` (já é membro / já convidado / pode convidar / lotado).
   */
  async listInvitable(viewerId: string, targetUserId: string) {
    if (viewerId === targetUserId) return [];
    const memberships = await this.prisma.sidePoolMember.findMany({
      where: { userId: viewerId },
      include: { sidePool: { include: { _count: { select: { members: true } } } } },
      orderBy: { joinedAt: 'desc' },
    });
    const poolIds = memberships.map((m) => m.sidePoolId);
    if (poolIds.length === 0) return [];

    const [targetMemberships, pendingInvites] = await Promise.all([
      this.prisma.sidePoolMember.findMany({
        where: { userId: targetUserId, sidePoolId: { in: poolIds } },
        select: { sidePoolId: true },
      }),
      this.prisma.sidePoolInvite.findMany({
        where: { inviteeUserId: targetUserId, sidePoolId: { in: poolIds } },
        select: { id: true, sidePoolId: true },
      }),
    ]);
    const targetMemberOf = new Set(targetMemberships.map((m) => m.sidePoolId));
    const inviteByPool = new Map(pendingInvites.map((i) => [i.sidePoolId, i.id]));

    return memberships.map((m) => {
      const pool = m.sidePool;
      const inviteId = inviteByPool.get(pool.id) ?? null;
      let state: 'member' | 'invited' | 'invitable' | 'full';
      if (targetMemberOf.has(pool.id)) state = 'member';
      else if (inviteId) state = 'invited';
      else if (pool._count.members >= pool.maxMembers) state = 'full';
      else state = 'invitable';
      return {
        sidePoolId: pool.id,
        name: pool.name,
        memberCount: pool._count.members,
        maxMembers: pool.maxMembers,
        state,
        inviteId,
      };
    });
  }

  private async toDto(sidePoolId: string) {
    const sp = await this.prisma.sidePool.findUniqueOrThrow({
      where: { id: sidePoolId },
      include: { _count: { select: { members: true } } },
    });
    return {
      id: sp.id,
      name: sp.name,
      description: sp.description,
      ownerUserId: sp.ownerUserId,
      maxMembers: sp.maxMembers,
      memberCount: sp._count.members,
      inviteToken: sp.inviteToken,
      createdAt: sp.createdAt,
    };
  }
}
