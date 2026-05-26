import { ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { FIFA_WC_2026_ID } from '@bolao/shared';

@Injectable()
export class CompetitionService {
  constructor(private readonly prisma: PrismaService) {}

  async getMain() {
    const competition = await this.prisma.competition.findUnique({
      where: { id: FIFA_WC_2026_ID },
    });
    if (!competition) throw new NotFoundException('Competition not initialized — run seed');
    return competition;
  }

  /**
   * Asserts that the competition is still open for guess submissions.
   * Uses the database clock (NOW()) rather than the application clock to
   * eliminate drift between API replicas. Throws 403 LOCKED_COMPETITION if
   * the lock has passed or the closure status moved beyond `open`.
   */
  async assertOpen(): Promise<void> {
    const rows = await this.prisma.$queryRaw<Array<{ now: Date }>>`SELECT NOW() as now`;
    const now = rows[0]?.now ?? new Date();
    const competition = await this.getMain();

    if (competition.closureStatus !== 'open' || competition.locksAt <= now) {
      throw new ForbiddenException({
        code: 'LOCKED_COMPETITION',
        message: 'Competition is locked — no more guess submissions allowed',
        locksAt: competition.locksAt.toISOString(),
      });
    }
  }
}
