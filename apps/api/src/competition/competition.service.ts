import { ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PrismaService } from '../prisma/prisma.service';
import { FIFA_WC_2026_ID } from '@bolao/shared';

@Injectable()
export class CompetitionService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly config: ConfigService,
  ) {}

  async getMain() {
    const competition = await this.prisma.competition.findUnique({
      where: { id: FIFA_WC_2026_ID },
    });
    if (!competition) throw new NotFoundException('Competition not initialized — run seed');
    return competition;
  }

  /**
   * Knockout-stage palpites lock. Sourced from COMPETITION_KO_LOCKS_AT env
   * var (ISO 8601 UTC); falls back to `locksAt + 19 days` (rough FIFA
   * timeline from group lock to first KO) when unset.
   */
  async getKnockoutLockAt(): Promise<Date> {
    const fromEnv = this.config.get<string>('COMPETITION_KO_LOCKS_AT');
    if (fromEnv) {
      const parsed = new Date(fromEnv);
      if (!Number.isNaN(parsed.getTime())) return parsed;
    }
    const competition = await this.getMain();
    return new Date(competition.locksAt.getTime() + 19 * 24 * 3600 * 1000);
  }

  /**
   * Asserts that group-stage palpites are still open. Uses the database
   * clock (NOW()) rather than the application clock to eliminate drift
   * between API replicas. Throws 403 LOCKED_COMPETITION if past the lock.
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

  /**
   * Asserts that knockout palpites are still open. Throws 403
   * LOCKED_KNOCKOUT past `getKnockoutLockAt()`.
   *
   * Note: group palpites must already be submitted (caller's responsibility).
   * This guard only enforces the per-phase deadline.
   */
  async assertKnockoutOpen(): Promise<void> {
    const rows = await this.prisma.$queryRaw<Array<{ now: Date }>>`SELECT NOW() as now`;
    const now = rows[0]?.now ?? new Date();
    const knockoutLock = await this.getKnockoutLockAt();

    if (knockoutLock <= now) {
      throw new ForbiddenException({
        code: 'LOCKED_KNOCKOUT',
        message: 'Knockout palpites are locked — submissions closed 1h before the first KO match',
        knockoutLocksAt: knockoutLock.toISOString(),
      });
    }
  }
}
