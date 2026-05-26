import {
  Body,
  Controller,
  ForbiddenException,
  Get,
  HttpCode,
  HttpStatus,
  Inject,
  Param,
  Post,
} from '@nestjs/common';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import type { AuthenticatedUser } from '../auth/strategies/jwt.strategy';
import { PaymentService } from './payment.service';
import { PAYMENT_DRIVER } from './payment.tokens';
import { MockPaymentDriver } from './drivers/mock-payment.driver';
import type { IPaymentDriver, WebhookEvent } from './drivers/payment-driver.interface';
import { RefundSubscriptionBody } from './dto/refund.dto';

@Controller('subscription')
export class PaymentController {
  constructor(
    private readonly payment: PaymentService,
    @Inject(PAYMENT_DRIVER) private readonly driver: IPaymentDriver,
  ) {}

  @Post('payment-intent')
  @HttpCode(HttpStatus.CREATED)
  createPaymentIntent(@CurrentUser() user: AuthenticatedUser) {
    return this.payment.createOrGetPaymentIntent(user.id);
  }

  @Get('payment-intent/:id/status')
  getPaymentIntentStatus(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id') id: string,
  ) {
    return this.payment.getPaymentIntentStatus(user.id, id);
  }

  @Post('refund')
  @HttpCode(HttpStatus.OK)
  refund(@CurrentUser() user: AuthenticatedUser, @Body() _body: RefundSubscriptionBody) {
    return this.payment.refund(user.id);
  }

  /**
   * Dev/CI: synthesises a Stripe-style `payment_intent.succeeded` event and
   * runs it through the real webhook handler. Disabled in production AND
   * when a non-mock driver is configured.
   */
  @Post('mock-confirm')
  @HttpCode(HttpStatus.OK)
  async mockConfirm(@CurrentUser() user: AuthenticatedUser) {
    if (process.env.NODE_ENV === 'production') {
      throw new ForbiddenException('mock-confirm is disabled in production');
    }
    if (!(this.driver instanceof MockPaymentDriver)) {
      throw new ForbiddenException(
        'mock-confirm requires STRIPE_DRIVER=mock — production drivers must use real Stripe events',
      );
    }
    const piId = await this.payment.getOwnPaymentIntentId(user.id);
    if (!piId) {
      throw new ForbiddenException('No payment intent to confirm — call POST /subscription/payment-intent first');
    }
    const succeeded = this.driver.forceSucceed(piId);
    const synth: WebhookEvent = {
      id: `mock_evt_${succeeded.id}_${Date.now()}`,
      type: 'payment_intent.succeeded',
      paymentIntent: succeeded,
    };
    const result = await this.payment.handleWebhookEvent(synth, 'mock');
    return { mock: true, paymentIntentId: succeeded.id, webhook: result };
  }
}
