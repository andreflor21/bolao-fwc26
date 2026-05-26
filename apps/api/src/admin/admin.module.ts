import { Module } from '@nestjs/common';
import { AdminMatchController } from './admin-match.controller';
import { AdminMatchService } from './admin-match.service';
import { AdminOpsController } from './admin-ops.controller';
import { AdminClosureController } from './admin-closure.controller';
import { AdminClosureService } from './admin-closure.service';
import { AdminPrizeController } from './admin-prize.controller';
import { RankingModule } from '../ranking/ranking.module';
import { PrizeModule } from '../prize/prize.module';

@Module({
  imports: [RankingModule, PrizeModule],
  controllers: [
    AdminMatchController,
    AdminOpsController,
    AdminClosureController,
    AdminPrizeController,
  ],
  providers: [AdminMatchService, AdminClosureService],
  exports: [AdminMatchService, AdminClosureService],
})
export class AdminModule {}
