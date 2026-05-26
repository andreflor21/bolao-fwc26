import { Global, Module } from '@nestjs/common';
import { CompetitionService } from './competition.service';

@Global()
@Module({
  providers: [CompetitionService],
  exports: [CompetitionService],
})
export class CompetitionModule {}
