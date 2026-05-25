import {
  Body,
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  ParseUUIDPipe,
  Post,
  UseGuards,
} from '@nestjs/common';
import { SidePoolService } from './side-pool.service';
import { CreateSidePoolDto } from './dto/create-side-pool.dto';
import { ActiveSubscriptionGuard } from '../auth/guards/active-subscription.guard';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import type { AuthenticatedUser } from '../auth/strategies/jwt.strategy';

@Controller('side-pools')
@UseGuards(ActiveSubscriptionGuard)
export class SidePoolController {
  constructor(private readonly service: SidePoolService) {}

  @Post()
  @HttpCode(HttpStatus.CREATED)
  create(@CurrentUser() user: AuthenticatedUser, @Body() dto: CreateSidePoolDto) {
    return this.service.create(user.id, dto);
  }

  @Get()
  listMine(@CurrentUser() user: AuthenticatedUser) {
    return this.service.listMine(user.id);
  }

  @Get(':id')
  getOne(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id', ParseUUIDPipe) id: string,
  ) {
    return this.service.getOne(user.id, id);
  }

  @Get(':id/invite')
  getInvite(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id', ParseUUIDPipe) id: string,
  ) {
    return this.service.getInvite(user.id, id);
  }

  @Post('join/:token')
  @HttpCode(HttpStatus.OK)
  join(@CurrentUser() user: AuthenticatedUser, @Param('token') token: string) {
    return this.service.joinByToken(user.id, token);
  }
}
