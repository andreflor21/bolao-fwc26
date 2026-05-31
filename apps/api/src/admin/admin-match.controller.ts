import {
  Body,
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  ParseUUIDPipe,
  Post,
  Put,
  UseGuards,
} from '@nestjs/common';
import { AdminMatchService } from './admin-match.service';
import { Roles } from '../auth/decorators/roles.decorator';
import { RolesGuard } from '../auth/guards/roles.guard';
import { RegisterMatchResultBody } from './dto/register-result.dto';
import { BulkResultsBody } from './dto/bulk-results.dto';

@Controller('admin/matches')
@UseGuards(RolesGuard)
@Roles('admin')
export class AdminMatchController {
  constructor(private readonly adminMatch: AdminMatchService) {}

  @Put(':id/result')
  @HttpCode(HttpStatus.OK)
  registerResult(
    @Param('id', new ParseUUIDPipe()) id: string,
    @Body() body: RegisterMatchResultBody,
  ) {
    return this.adminMatch.registerResult(id, body);
  }

  /** Distribuição dos placares palpitados para um jogo (mais jogados primeiro). */
  @Get(':id/guess-distribution')
  guessDistribution(@Param('id', new ParseUUIDPipe()) id: string) {
    return this.adminMatch.guessDistribution(id);
  }

  /** Lança vários resultados de uma vez (import de CSV no front). */
  @Post('bulk-results')
  @HttpCode(HttpStatus.OK)
  bulkResults(@Body() body: BulkResultsBody) {
    return this.adminMatch.bulkRegisterResults(body.results);
  }
}
