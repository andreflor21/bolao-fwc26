import { Module } from '@nestjs/common';
import { SidePoolController } from './side-pool.controller';
import { SidePoolService } from './side-pool.service';
import { ActiveSubscriptionGuard } from '../auth/guards/active-subscription.guard';

@Module({
  controllers: [SidePoolController],
  providers: [SidePoolService, ActiveSubscriptionGuard],
  exports: [SidePoolService],
})
export class SidePoolModule {}
