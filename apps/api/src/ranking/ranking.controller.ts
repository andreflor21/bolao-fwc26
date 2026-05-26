import {
  Controller,
  ForbiddenException,
  Get,
  Param,
  ParseIntPipe,
  ParseUUIDPipe,
  Query,
  UseGuards,
} from '@nestjs/common';
import { RankingService } from './ranking.service';
import { PrismaService } from '../prisma/prisma.service';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import type { AuthenticatedUser } from '../auth/strategies/jwt.strategy';
import { ActiveSubscriptionGuard } from '../auth/guards/active-subscription.guard';

@Controller()
@UseGuards(ActiveSubscriptionGuard)
export class RankingController {
  constructor(
    private readonly ranking: RankingService,
    private readonly prisma: PrismaService,
  ) {}

  @Get('general-pool/ranking')
  general(
    @CurrentUser() user: AuthenticatedUser,
    @Query('limit', new ParseIntPipe({ optional: true })) limit?: number,
  ) {
    return this.ranking.getGeneralRanking({ limit: limit ?? 100, userId: user.id });
  }

  @Get('side-pools/:id/ranking')
  async sidePool(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id', new ParseUUIDPipe()) sidePoolId: string,
    @Query('limit', new ParseIntPipe({ optional: true })) limit?: number,
  ) {
    // Membership check — only members can see the ranking of their side pool.
    const membership = await this.prisma.sidePoolMember.findUnique({
      where: { sidePoolId_userId: { sidePoolId, userId: user.id } },
      select: { sidePool: { select: { name: true } } },
    });
    if (!membership) {
      throw new ForbiddenException('You are not a member of this side pool');
    }
    return this.ranking.getSidePoolRanking(sidePoolId, membership.sidePool.name, {
      limit: limit ?? 100,
      userId: user.id,
    });
  }
}
