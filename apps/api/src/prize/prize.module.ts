import { Module } from '@nestjs/common';
import { PrizeController } from './prize.controller';
import { PrizeService } from './prize.service';
import { RankingModule } from '../ranking/ranking.module';

@Module({
  imports: [RankingModule],
  controllers: [PrizeController],
  providers: [PrizeService],
  exports: [PrizeService],
})
export class PrizeModule {}
