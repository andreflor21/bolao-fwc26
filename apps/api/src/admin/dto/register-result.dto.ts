import { IsBoolean, IsInt, IsOptional, Max, Min } from 'class-validator';
import { GUESS_GOAL_MAX, GUESS_GOAL_MIN } from '@bolao/shared';

export class RegisterMatchResultBody {
  @IsInt()
  @Min(GUESS_GOAL_MIN)
  @Max(GUESS_GOAL_MAX)
  homeGoals!: number;

  @IsInt()
  @Min(GUESS_GOAL_MIN)
  @Max(GUESS_GOAL_MAX)
  awayGoals!: number;

  @IsOptional()
  @IsBoolean()
  confirmPreview?: boolean;
}
