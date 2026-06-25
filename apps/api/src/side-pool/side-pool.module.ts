import { Module } from '@nestjs/common';
import { SidePoolController } from './side-pool.controller';
import { SidePoolService } from './side-pool.service';
import { ActiveSubscriptionGuard } from '../auth/guards/active-subscription.guard';
import { RankingModule } from '../ranking/ranking.module';

@Module({
  imports: [RankingModule],
  controllers: [SidePoolController],
  providers: [SidePoolService, ActiveSubscriptionGuard],
  exports: [SidePoolService],
})
export class SidePoolModule {}
