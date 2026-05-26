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
  Query,
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

  @Post('checkout-session')
  @HttpCode(HttpStatus.CREATED)
  createCheckoutSession(@CurrentUser() user: AuthenticatedUser) {
    return this.payment.createOrGetCheckoutSession(user.id);
  }

  @Get('payment-status')
  getPaymentStatus(@CurrentUser() user: AuthenticatedUser, @Query('sid') sid?: string) {
    return this.payment.getPaymentStatus(user.id, sid);
  }

  @Post('refund')
  @HttpCode(HttpStatus.OK)
  refund(@CurrentUser() user: AuthenticatedUser, @Body() _body: RefundSubscriptionBody) {
    return this.payment.refund(user.id);
  }

  /**
   * Dev/CI: completes a mock checkout session and synthesises a
   * `checkout.session.completed` event through the real handler. Disabled in
   * production and when a non-mock driver is configured.
   */
  @Post('mock-confirm/:sessionId')
  @HttpCode(HttpStatus.OK)
  async mockConfirm(
    @CurrentUser() _user: AuthenticatedUser,
    @Param('sessionId') sessionId: string,
  ) {
    if (process.env.NODE_ENV === 'production') {
      throw new ForbiddenException('mock-confirm is disabled in production');
    }
    if (!(this.driver instanceof MockPaymentDriver)) {
      throw new ForbiddenException(
        'mock-confirm requires STRIPE_DRIVER=mock — production drivers must use real Stripe events',
      );
    }
    const { session, pi } = this.driver.forceSucceed(sessionId);
    const synth: WebhookEvent = {
      id: `mock_evt_${session.sessionId}_${Date.now()}`,
      type: 'checkout.session.completed',
      paymentIntent: pi,
      paymentIntentId: pi.id,
      checkoutSessionId: session.sessionId,
    };
    const result = await this.payment.handleWebhookEvent(synth, 'mock');
    return { mock: true, sessionId: session.sessionId, paymentIntentId: pi.id, webhook: result };
  }
}
