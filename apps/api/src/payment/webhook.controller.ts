import {
  BadRequestException,
  Controller,
  Headers,
  HttpCode,
  HttpStatus,
  Inject,
  Logger,
  Post,
  RawBodyRequest,
  Req,
} from '@nestjs/common';
import { SkipThrottle } from '@nestjs/throttler';
import type { FastifyRequest } from 'fastify';
import { Public } from '../auth/decorators/public.decorator';
import { PaymentService } from './payment.service';
import { PAYMENT_DRIVER } from './payment.tokens';
import type { IPaymentDriver } from './drivers/payment-driver.interface';

@Controller('webhooks/stripe')
@Public()
@SkipThrottle()
export class WebhookController {
  private readonly logger = new Logger(WebhookController.name);

  constructor(
    private readonly payment: PaymentService,
    @Inject(PAYMENT_DRIVER) private readonly driver: IPaymentDriver,
  ) {}

  @Post()
  @HttpCode(HttpStatus.OK)
  async handle(
    @Req() req: RawBodyRequest<FastifyRequest>,
    @Headers('stripe-signature') signature: string | undefined,
  ) {
    const raw = req.rawBody;
    if (!raw) {
      throw new BadRequestException(
        'Missing raw body. Ensure NestFactory.create({ rawBody: true }) is set.',
      );
    }
    const buffer = Buffer.isBuffer(raw) ? raw : Buffer.from(raw, 'utf8');

    let event;
    try {
      event = this.driver.parseWebhookEvent(buffer, signature ?? null);
    } catch (e) {
      this.logger.warn(`Webhook signature verification failed: ${(e as Error).message}`);
      throw new BadRequestException({
        code: 'WEBHOOK_SIGNATURE_INVALID',
        message: (e as Error).message,
      });
    }

    const result = await this.payment.handleWebhookEvent(event, this.driver.name);
    this.logger.log(
      `Webhook ${event.id} (${event.type}) → ${result.handled ? 'handled' : `skipped: ${result.reason}`}`,
    );
    return { received: true, ...result };
  }
}
