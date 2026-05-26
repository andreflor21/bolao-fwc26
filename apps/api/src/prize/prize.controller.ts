import { Controller, Get, UseGuards } from '@nestjs/common';
import { PrizeService } from './prize.service';
import { ActiveSubscriptionGuard } from '../auth/guards/active-subscription.guard';

@Controller('general-pool/prizes')
@UseGuards(ActiveSubscriptionGuard)
export class PrizeController {
  constructor(private readonly prize: PrizeService) {}

  @Get()
  view() {
    return this.prize.getPrizesView();
  }
}
