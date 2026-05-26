import {
  Body,
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  Post,
  Put,
  UseGuards,
} from '@nestjs/common';
import { GuessService } from './guess.service';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import type { AuthenticatedUser } from '../auth/strategies/jwt.strategy';
import { ActiveSubscriptionGuard } from '../auth/guards/active-subscription.guard';
import { SaveDraftGuessesBody } from './dto/save-draft.dto';
import { SaveKnockoutScoresBody } from './dto/save-knockout-scores.dto';
import { SaveManualTiebreakBody } from './dto/save-manual-tiebreak.dto';
import type { GroupLetter } from '@bolao/shared';

@Controller('guesses')
@UseGuards(ActiveSubscriptionGuard)
export class GuessController {
  constructor(private readonly guess: GuessService) {}

  @Get()
  list(@CurrentUser() user: AuthenticatedUser) {
    return this.guess.list(user.id);
  }

  @Put('group-stage')
  @HttpCode(HttpStatus.OK)
  saveDraft(@CurrentUser() user: AuthenticatedUser, @Body() body: SaveDraftGuessesBody) {
    return this.guess.saveDraft(user.id, body);
  }

  @Post('submit')
  @HttpCode(HttpStatus.OK)
  submit(@CurrentUser() user: AuthenticatedUser) {
    return this.guess.submit(user.id);
  }

  @Get('bracket-preview')
  bracketPreview(@CurrentUser() user: AuthenticatedUser) {
    return this.guess.getBracketPreview(user.id);
  }

  @Get('knockout')
  knockoutGuesses(@CurrentUser() user: AuthenticatedUser) {
    return this.guess.getMyKnockoutGuesses(user.id);
  }

  @Put('knockout-scores')
  @HttpCode(HttpStatus.OK)
  saveKnockoutScores(
    @CurrentUser() user: AuthenticatedUser,
    @Body() body: SaveKnockoutScoresBody,
  ) {
    return this.guess.saveKnockoutScores(user.id, body);
  }

  @Post('knockout-submit')
  @HttpCode(HttpStatus.OK)
  submitKnockout(@CurrentUser() user: AuthenticatedUser) {
    return this.guess.submitKnockoutGuesses(user.id);
  }

  @Put('manual-tiebreak')
  @HttpCode(HttpStatus.OK)
  saveManualTiebreak(
    @CurrentUser() user: AuthenticatedUser,
    @Body() body: SaveManualTiebreakBody,
  ) {
    const order: Partial<Record<GroupLetter, string[]>> = {};
    for (const item of body.orders) order[item.groupLetter] = item.teamCodes;
    return this.guess.saveManualTiebreakOrder(user.id, order);
  }
}
