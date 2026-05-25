import { Controller, ForbiddenException, Get, HttpCode, HttpStatus, Post } from '@nestjs/common';
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

  @Post()
  @HttpCode(HttpStatus.CREATED)
  create(@CurrentUser() user: AuthenticatedUser) {
    return this.subscription.createOrGet(user.id);
  }

  /**
   * Sprint 1 placeholder. Sprint 3 troca por Stripe webhook real.
   * Disponível apenas em NODE_ENV != production.
   */
  @Post('mock-confirm')
  @HttpCode(HttpStatus.OK)
  mockConfirm(@CurrentUser() user: AuthenticatedUser) {
    if (process.env.NODE_ENV === 'production') {
      throw new ForbiddenException('mock-confirm is disabled in production');
    }
    return this.subscription.mockConfirmPayment(user.id);
  }
}
