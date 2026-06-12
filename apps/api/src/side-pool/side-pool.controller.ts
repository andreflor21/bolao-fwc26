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
import { InviteMemberDto } from './dto/invite-member.dto';
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

  // -------- Convites individuais (qualquer membro pode convidar) --------

  /** Convida um participante para um bolão paralelo do qual o usuário é membro. */
  @Post(':id/invites')
  @HttpCode(HttpStatus.CREATED)
  invite(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: InviteMemberDto,
  ) {
    return this.service.invite(user.id, id, dto.inviteeUserId);
  }

  /** Bolões paralelos do usuário + estado em relação a um participante alvo. */
  @Get('invitable/:targetUserId')
  invitable(
    @CurrentUser() user: AuthenticatedUser,
    @Param('targetUserId', ParseUUIDPipe) targetUserId: string,
  ) {
    return this.service.listInvitable(user.id, targetUserId);
  }

  /** Convites pendentes recebidos pelo usuário logado (viram badge no nome). */
  @Get('invites/received')
  receivedInvites(@CurrentUser() user: AuthenticatedUser) {
    return this.service.listReceivedInvites(user.id);
  }

  @Post('invites/:inviteId/accept')
  @HttpCode(HttpStatus.OK)
  acceptInvite(
    @CurrentUser() user: AuthenticatedUser,
    @Param('inviteId', ParseUUIDPipe) inviteId: string,
  ) {
    return this.service.acceptInvite(user.id, inviteId);
  }

  @Post('invites/:inviteId/decline')
  @HttpCode(HttpStatus.OK)
  declineInvite(
    @CurrentUser() user: AuthenticatedUser,
    @Param('inviteId', ParseUUIDPipe) inviteId: string,
  ) {
    return this.service.declineInvite(user.id, inviteId);
  }
}
