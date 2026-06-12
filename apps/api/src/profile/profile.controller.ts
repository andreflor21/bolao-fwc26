import { Controller, Get, Param, ParseUUIDPipe, UseGuards } from '@nestjs/common';
import { ProfileService } from './profile.service';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import type { AuthenticatedUser } from '../auth/strategies/jwt.strategy';
import { ActiveSubscriptionGuard } from '../auth/guards/active-subscription.guard';

/**
 * Perfis dos participantes do bolão geral — só pagantes acessam (mesma regra
 * do ranking geral). Os palpites alheios só são revelados após o lock de cada
 * jogo (kickoff < now() OU resultado oficial cadastrado), enquanto o próprio
 * dono vê tudo a qualquer momento.
 */
@Controller('profiles')
@UseGuards(ActiveSubscriptionGuard)
export class ProfileController {
  constructor(private readonly profile: ProfileService) {}

  @Get()
  list() {
    return this.profile.listParticipants();
  }

  @Get(':userId/group-guesses')
  groupGuesses(
    @CurrentUser() user: AuthenticatedUser,
    @Param('userId', new ParseUUIDPipe()) targetUserId: string,
  ) {
    return this.profile.getGroupGuesses(user.id, targetUserId);
  }

  @Get(':userId/knockout-guesses')
  knockoutGuesses(
    @CurrentUser() user: AuthenticatedUser,
    @Param('userId', new ParseUUIDPipe()) targetUserId: string,
  ) {
    return this.profile.getKnockoutGuesses(user.id, targetUserId);
  }

  @Get(':userId/evolution')
  evolution(
    @CurrentUser() user: AuthenticatedUser,
    @Param('userId', new ParseUUIDPipe()) targetUserId: string,
  ) {
    return this.profile.getRankingEvolution(user.id, targetUserId);
  }
}
