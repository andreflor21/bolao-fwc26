import { Module } from '@nestjs/common';
import { AdminMatchController } from './admin-match.controller';
import { AdminMatchService } from './admin-match.service';
import { AdminOpsController } from './admin-ops.controller';
import { RankingModule } from '../ranking/ranking.module';
import { PrizeModule } from '../prize/prize.module';

@Module({
  imports: [RankingModule, PrizeModule],
  controllers: [AdminMatchController, AdminOpsController],
  providers: [AdminMatchService],
  exports: [AdminMatchService],
})
export class AdminModule {}
