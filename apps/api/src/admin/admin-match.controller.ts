import {
  Body,
  Controller,
  HttpCode,
  HttpStatus,
  Param,
  ParseUUIDPipe,
  Put,
  UseGuards,
} from '@nestjs/common';
import { AdminMatchService } from './admin-match.service';
import { Roles } from '../auth/decorators/roles.decorator';
import { RolesGuard } from '../auth/guards/roles.guard';
import { RegisterMatchResultBody } from './dto/register-result.dto';

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
}
