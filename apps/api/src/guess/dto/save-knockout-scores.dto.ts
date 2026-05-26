import { Type } from 'class-transformer';
import {
  ArrayMaxSize,
  ArrayMinSize,
  IsArray,
  IsInt,
  IsOptional,
  IsString,
  Matches,
  Max,
  MaxLength,
  Min,
  ValidateNested,
} from 'class-validator';
import { GUESS_GOAL_MAX, GUESS_GOAL_MIN, KNOCKOUT_STAGE_FIXTURE_COUNT } from '@bolao/shared';

export class KnockoutScoreInput {
  // Fixture IDs follow the pattern 'R32-73' .. 'TP-103' .. 'F-104'.
  @IsString()
  @Matches(/^(R32|R16|QF|SF|TP|F)-\d{2,3}$/)
  fixtureId!: string;

  @IsInt()
  @Min(GUESS_GOAL_MIN)
  @Max(GUESS_GOAL_MAX)
  homeGoals!: number;

  @IsInt()
  @Min(GUESS_GOAL_MIN)
  @Max(GUESS_GOAL_MAX)
  awayGoals!: number;

  /**
   * Required when homeGoals === awayGoals: the team that advances on draws.
   * Service-level check ensures the value is one of the fixture's two teams.
   */
  @IsOptional()
  @IsString()
  @MaxLength(8)
  advancesTeamCode?: string | null;
}

export class SaveKnockoutScoresBody {
  @IsArray()
  @ArrayMinSize(1)
  @ArrayMaxSize(KNOCKOUT_STAGE_FIXTURE_COUNT)
  @ValidateNested({ each: true })
  @Type(() => KnockoutScoreInput)
  scores!: KnockoutScoreInput[];
}
