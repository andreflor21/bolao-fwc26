import {
  Body,
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  Post,
  Query,
  UseGuards,
} from '@nestjs/common';
import { BroadcastService } from './broadcast.service';
import { GroupInviteService } from './group-invite.service';
import { Roles } from '../auth/decorators/roles.decorator';
import { RolesGuard } from '../auth/guards/roles.guard';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import type { AuthenticatedUser } from '../auth/strategies/jwt.strategy';
import { PreviewBroadcastBody } from './dto/preview.dto';
import { SendBroadcastBody } from './dto/send.dto';
import { SendGroupInvitesBody } from './dto/group-invite.dto';

@Controller('admin/broadcast')
@UseGuards(RolesGuard)
@Roles('admin')
export class BroadcastController {
  constructor(
    private readonly broadcast: BroadcastService,
    private readonly groupInvite: GroupInviteService,
  ) {}

  /** Gera (ou reusa template) o rascunho de um preset — admin pode editar antes de enviar. */
  @Post('preview')
  @HttpCode(HttpStatus.OK)
  preview(@Body() body: PreviewBroadcastBody) {
    return this.broadcast.preview(body.presetKey, body.matchId);
  }

  /** Dispara a mensagem (texto já editado pelo admin) no grupo configurado. */
  @Post('send')
  @HttpCode(HttpStatus.OK)
  send(@CurrentUser() user: AuthenticatedUser, @Body() body: SendBroadcastBody) {
    return this.broadcast.send(user.id, body.text, body.presetKey);
  }

  @Get('history')
  history(@Query('limit') limit?: string) {
    const parsed = limit ? Number(limit) : 20;
    return this.broadcast.history(Number.isFinite(parsed) ? parsed : 20);
  }

  /** Lista de usuários elegíveis pra receber convite do grupo (opt-in + WhatsApp + sub ativa). */
  @Get('group-invite/candidates')
  candidates() {
    return this.groupInvite.listCandidates();
  }

  /** Dispara o convite: tenta adicionar direto + DM fallback com o link do grupo. */
  @Post('group-invite/send')
  @HttpCode(HttpStatus.OK)
  sendInvites(
    @CurrentUser() user: AuthenticatedUser,
    @Body() body: SendGroupInvitesBody,
  ) {
    return this.groupInvite.sendInvites(
      user.id,
      body.userIds,
      body.template,
      body.tryAddDirect ?? true,
    );
  }
}
