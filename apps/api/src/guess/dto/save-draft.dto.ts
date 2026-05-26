import { Type } from 'class-transformer';
import {
  ArrayMaxSize,
  ArrayMinSize,
  IsArray,
  IsInt,
  IsUUID,
  Max,
  Min,
  ValidateNested,
} from 'class-validator';
import { GROUP_STAGE_MATCH_COUNT, GUESS_GOAL_MAX, GUESS_GOAL_MIN } from '@bolao/shared';

export class GroupGuessInput {
  @IsUUID()
  matchId!: string;

  @IsInt()
  @Min(GUESS_GOAL_MIN)
  @Max(GUESS_GOAL_MAX)
  homeGoals!: number;

  @IsInt()
  @Min(GUESS_GOAL_MIN)
  @Max(GUESS_GOAL_MAX)
  awayGoals!: number;
}

export class SaveDraftGuessesBody {
  @IsArray()
  @ArrayMinSize(1)
  @ArrayMaxSize(GROUP_STAGE_MATCH_COUNT)
  @ValidateNested({ each: true })
  @Type(() => GroupGuessInput)
  guesses!: GroupGuessInput[];
}
