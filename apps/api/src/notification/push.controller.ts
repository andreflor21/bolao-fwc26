import {
  Body,
  Controller,
  Delete,
  Get,
  Headers,
  HttpCode,
  HttpStatus,
  Post,
} from '@nestjs/common';
import { PushService } from './push.service';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import type { AuthenticatedUser } from '../auth/strategies/jwt.strategy';
import { Public } from '../auth/decorators/public.decorator';
import { SubscribePushBody, UnsubscribePushBody } from './dto/subscribe.dto';

@Controller('push')
export class PushController {
  constructor(private readonly push: PushService) {}

  @Get('vapid-public-key')
  @Public()
  vapidKey() {
    return {
      publicKey: this.push.getVapidPublicKey(),
      enabled: this.push.isEnabled(),
    };
  }

  @Post('subscribe')
  @HttpCode(HttpStatus.OK)
  async subscribe(
    @CurrentUser() user: AuthenticatedUser,
    @Body() body: SubscribePushBody,
    @Headers('user-agent') userAgent?: string,
  ) {
    return this.push.subscribe(
      user.id,
      { endpoint: body.endpoint, keys: body.keys },
      userAgent ?? null,
    );
  }

  @Delete('subscribe')
  @HttpCode(HttpStatus.OK)
  async unsubscribe(
    @CurrentUser() user: AuthenticatedUser,
    @Body() body: UnsubscribePushBody,
  ) {
    return this.push.unsubscribe(user.id, body.endpoint);
  }
}
