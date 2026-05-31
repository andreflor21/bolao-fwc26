import { Type } from 'class-transformer';
import { ArrayMaxSize, IsArray, IsInt, IsString, Max, Min, ValidateNested } from 'class-validator';
import { GUESS_GOAL_MAX, GUESS_GOAL_MIN } from '@bolao/shared';

export class BulkResultRow {
  @IsString()
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

export class BulkResultsBody {
  @IsArray()
  @ArrayMaxSize(200)
  @ValidateNested({ each: true })
  @Type(() => BulkResultRow)
  results!: BulkResultRow[];
}
