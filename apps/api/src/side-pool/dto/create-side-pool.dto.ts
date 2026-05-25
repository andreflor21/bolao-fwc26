import { IsInt, IsOptional, IsString, Max, MaxLength, Min, MinLength } from 'class-validator';
import { DEFAULT_SIDE_POOL_MAX_MEMBERS } from '@bolao/shared';

export class CreateSidePoolDto {
  @IsString()
  @MinLength(3)
  @MaxLength(60)
  name!: string;

  @IsOptional()
  @IsString()
  @MaxLength(280)
  description?: string;

  @IsOptional()
  @IsInt()
  @Min(2)
  @Max(DEFAULT_SIDE_POOL_MAX_MEMBERS)
  maxMembers?: number;
}
