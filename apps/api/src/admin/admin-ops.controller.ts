import { Controller, HttpCode, HttpStatus, Post, UseGuards } from '@nestjs/common';
import { RankingService } from '../ranking/ranking.service';
import { PrizeService } from '../prize/prize.service';
import { Roles } from '../auth/decorators/roles.decorator';
import { RolesGuard } from '../auth/guards/roles.guard';

@Controller('admin')
@UseGuards(RolesGuard)
@Roles('admin')
export class AdminOpsController {
  constructor(
    private readonly ranking: RankingService,
    private readonly prize: PrizeService,
  ) {}

  /**
   * Forces a full rebuild of the ranking ZSETs from `guess_scores` in
   * Postgres + invalidates the cached prize breakdown. Idempotent — safe
   * to run at any time. Use when Redis state has drifted (post-import,
   * Redis instance swap, suspected cache bug).
   */
  @Post('recompute')
  @HttpCode(HttpStatus.OK)
  async recompute() {
    const result = await this.ranking.recomputeAll();
    await this.prize.invalidate();
    return result;
  }
}
