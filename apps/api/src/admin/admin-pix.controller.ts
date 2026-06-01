import {
  Body,
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  Post,
  UseGuards,
} from '@nestjs/common';
import { RolesGuard } from '../auth/guards/roles.guard';
import { Roles } from '../auth/decorators/roles.decorator';
import { AdminPixService } from './admin-pix.service';

@Controller('admin/pix')
@UseGuards(RolesGuard)
@Roles('admin')
export class AdminPixController {
  constructor(private readonly adminPix: AdminPixService) {}

  /** Inscrições pagas via Pix aguardando revisão manual. */
  @Get('pending')
  listPending() {
    return this.adminPix.listPending();
  }

  /** Comprovante enviado pelo inscrito, como data URL pra exibir no <img>. */
  @Get(':id/receipt')
  getReceipt(@Param('id') id: string) {
    return this.adminPix.getReceipt(id);
  }

  /** Ativa a inscrição manualmente. */
  @Post(':id/approve')
  @HttpCode(HttpStatus.OK)
  approve(@Param('id') id: string) {
    return this.adminPix.approve(id);
  }

  /** Marca o comprovante como recusado. */
  @Post(':id/reject')
  @HttpCode(HttpStatus.OK)
  reject(@Param('id') id: string, @Body() body: { reason?: string }) {
    return this.adminPix.reject(id, body?.reason);
  }
}
