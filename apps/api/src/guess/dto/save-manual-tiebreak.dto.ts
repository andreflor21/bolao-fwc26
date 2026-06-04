import {
  ArrayMaxSize,
  ArrayMinSize,
  ArrayUnique,
  IsArray,
  IsIn,
  IsString,
  MaxLength,
  ValidateNested,
} from 'class-validator';
import { Type } from 'class-transformer';
import { GROUP_LETTERS, type GroupLetter } from '@bolao/shared';

export class GroupTiebreakOrderInput {
  @IsString()
  @IsIn(GROUP_LETTERS)
  groupLetter!: GroupLetter;

  /**
   * Player-supplied order for the still-tied subset within the group. Each
   * entry is a team code (e.g. "BRA"); the array must have 2-4 unique codes.
   * The service merges this into the persisted bracket payload and rebuilds
   * the bracket so downstream R32 slots reflect the new ordering.
   */
  @IsArray()
  @ArrayMinSize(2)
  @ArrayMaxSize(4)
  @ArrayUnique()
  @IsString({ each: true })
  @MaxLength(8, { each: true })
  teamCodes!: string[];
}

export class SaveManualTiebreakBody {
  @ValidateNested({ each: true })
  @Type(() => GroupTiebreakOrderInput)
  @IsArray()
  @ArrayMaxSize(12)
  orders!: GroupTiebreakOrderInput[];
}
