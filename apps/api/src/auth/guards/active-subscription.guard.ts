import { CanActivate, ExecutionContext, ForbiddenException, Injectable } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { FIFA_WC_2026_ID } from '@bolao/shared';

@Injectable()
export class ActiveSubscriptionGuard implements CanActivate {
  constructor(private readonly prisma: PrismaService) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const { user } = context.switchToHttp().getRequest();
    if (!user) throw new ForbiddenException('Not authenticated');

    const subscription = await this.prisma.subscription.findUnique({
      where: {
        userId_competitionId: {
          userId: user.id,
          competitionId: FIFA_WC_2026_ID,
        },
      },
      select: { status: true },
    });

    if (!subscription || subscription.status !== 'active') {
      throw new ForbiddenException('Active subscription to the General Pool required');
    }
    return true;
  }
}
