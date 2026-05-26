import { Controller, Get, UseGuards } from '@nestjs/common';
import { MatchService } from './match.service';
import { ActiveSubscriptionGuard } from '../auth/guards/active-subscription.guard';

@Controller('matches')
@UseGuards(ActiveSubscriptionGuard)
export class MatchController {
  constructor(private readonly match: MatchService) {}

  @Get('group-stage')
  listGroupStage() {
    return this.match.listGroupStage();
  }
}
