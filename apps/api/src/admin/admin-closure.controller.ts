import {
  Body,
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  Post,
  UseGuards,
} from '@nestjs/common';
import { AdminClosureService } from './admin-closure.service';
import { Roles } from '../auth/decorators/roles.decorator';
import { RolesGuard } from '../auth/guards/roles.guard';
import { FinalizeClosureBody } from './dto/finalize.dto';

@Controller('admin/closure')
@UseGuards(RolesGuard)
@Roles('admin')
export class AdminClosureController {
  constructor(private readonly closure: AdminClosureService) {}

  @Get('precheck')
  precheck() {
    return this.closure.precheck();
  }

  @Get('snapshot')
  snapshot() {
    return this.closure.getSnapshot();
  }

  @Post('finalize')
  @HttpCode(HttpStatus.OK)
  finalize(@Body() body: FinalizeClosureBody) {
    return this.closure.finalize(body);
  }
}
