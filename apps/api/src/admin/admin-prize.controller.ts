import {
  Body,
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  ParseUUIDPipe,
  Post,
  Res,
  UseGuards,
} from '@nestjs/common';
import type { FastifyReply } from 'fastify';
import { AdminClosureService } from './admin-closure.service';
import { Roles } from '../auth/decorators/roles.decorator';
import { RolesGuard } from '../auth/guards/roles.guard';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import type { AuthenticatedUser } from '../auth/strategies/jwt.strategy';
import { MarkPaidBody } from './dto/mark-paid.dto';

@Controller('admin/prizes')
@UseGuards(RolesGuard)
@Roles('admin')
export class AdminPrizeController {
  constructor(private readonly closure: AdminClosureService) {}

  /**
   * Returns the persisted payout snapshot for the prize table UI. Mirrors
   * `/admin/closure/snapshot` (same data, intentionally aliased here so the
   * web app's prize page doesn't reach across resource boundaries).
   */
  @Get()
  list() {
    return this.closure.getSnapshot();
  }

  @Get('payout-report')
  async payoutReport(@Res() reply: FastifyReply) {
    const csv = await this.closure.payoutReportCsv();
    reply
      .header('Content-Type', 'text/csv; charset=utf-8')
      .header(
        'Content-Disposition',
        'attachment; filename="payouts-fifa-wc-2026.csv"',
      )
      .send(csv);
  }

  @Post('payouts/:payoutId/mark-paid')
  @HttpCode(HttpStatus.OK)
  markPaid(
    @Param('payoutId', new ParseUUIDPipe()) payoutId: string,
    @CurrentUser() admin: AuthenticatedUser,
    @Body() body: MarkPaidBody,
  ) {
    return this.closure.markPaid(payoutId, admin.id, body.paymentReference ?? null);
  }
}
