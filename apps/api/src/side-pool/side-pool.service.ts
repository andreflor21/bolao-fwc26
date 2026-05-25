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

@Injectable()
export class SidePoolService {
  constructor(private readonly prisma: PrismaService) {}

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
    return { sidePoolId: sidePool.id, alreadyMember: false };
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
