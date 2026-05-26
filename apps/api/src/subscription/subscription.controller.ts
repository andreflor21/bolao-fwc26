import { Controller, Get } from '@nestjs/common';
import { SubscriptionService } from './subscription.service';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import type { AuthenticatedUser } from '../auth/strategies/jwt.strategy';

@Controller('subscription')
export class SubscriptionController {
  constructor(private readonly subscription: SubscriptionService) {}

  @Get('status')
  status(@CurrentUser() user: AuthenticatedUser) {
    return this.subscription.getStatus(user.id);
  }
}
