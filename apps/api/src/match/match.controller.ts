import { Controller, Get } from '@nestjs/common';
import { MatchService } from './match.service';

/**
 * Match metadata is non-sensitive (FIFA fixture list + official scores
 * once registered). Authenticated access is enforced by the global
 * JwtAuthGuard; no subscription is required so admins without a paid
 * subscription can still consume it.
 */
@Controller('matches')
export class MatchController {
  constructor(private readonly match: MatchService) {}

  @Get('group-stage')
  listGroupStage() {
    return this.match.listGroupStage();
  }
}
