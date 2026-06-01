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
import { IsInt, IsOptional, IsString, Max, Min, IsBoolean } from 'class-validator';
import type { GroupLetter } from '@bolao/shared';
import { Roles } from '../auth/decorators/roles.decorator';
import { RolesGuard } from '../auth/guards/roles.guard';
import { KnockoutService } from './knockout.service';

class RegisterKnockoutResultBody {
  @IsInt()
  @Min(0)
  @Max(30)
  homeGoals!: number;

  @IsInt()
  @Min(0)
  @Max(30)
  awayGoals!: number;

  @IsOptional()
  @IsString()
  advancesTeamCode?: string | null;

  @IsOptional()
  @IsBoolean()
  confirmPreview?: boolean;
}

class SetTiebreakBody {
  /** { "A": ["BRA","SUI","MEX","RSA"], ... } */
  order!: Partial<Record<GroupLetter, string[]>>;
}

@Controller('admin/knockout')
@UseGuards(RolesGuard)
@Roles('admin')
export class KnockoutController {
  constructor(private readonly knockout: KnockoutService) {}

  /** Os 32 confrontos do mata-mata com times resolvidos + placar/estado. */
  @Get('fixtures')
  listFixtures() {
    return this.knockout.listFixtures();
  }

  /** (Re)gera/propaga o chaveamento real a partir dos resultados oficiais. */
  @Post('recompute')
  @HttpCode(HttpStatus.OK)
  recompute() {
    return this.knockout.recomputeOfficialBracket();
  }

  /** Define a ordem manual de desempate oficial de um ou mais grupos. */
  @Post('tiebreak')
  @HttpCode(HttpStatus.OK)
  setTiebreak(@Body() body: SetTiebreakBody) {
    return this.knockout.setOfficialTiebreak(body.order ?? {});
  }

  /** Lança o resultado oficial de um confronto do mata-mata. */
  @Put(':matchId/result')
  @HttpCode(HttpStatus.OK)
  registerResult(
    @Param('matchId', new ParseUUIDPipe()) matchId: string,
    @Body() body: RegisterKnockoutResultBody,
  ) {
    return this.knockout.registerKnockoutResult(matchId, body);
  }
}
