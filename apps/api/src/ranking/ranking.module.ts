import { Module } from '@nestjs/common';
import { RankingController } from './ranking.controller';
import { RankingService } from './ranking.service';
import { RankingAlertCron } from './ranking-alert.cron';

@Module({
  controllers: [RankingController],
  providers: [RankingService, RankingAlertCron],
  exports: [RankingService],
})
export class RankingModule {}
