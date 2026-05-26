import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { FIFA_WC_2026_ID } from '@bolao/shared';

@Injectable()
export class SubscriptionService {
  constructor(private readonly prisma: PrismaService) {}

  async getStatus(userId: string) {
    const sub = await this.prisma.subscription.findUnique({
      where: { userId_competitionId: { userId, competitionId: FIFA_WC_2026_ID } },
      select: {
        id: true,
        status: true,
        amountCents: true,
        paidAt: true,
        refundedAt: true,
        createdAt: true,
      },
    });
    return sub ?? { status: 'not_subscribed' as const };
  }
}
