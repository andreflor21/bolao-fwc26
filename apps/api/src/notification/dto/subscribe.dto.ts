import { IsObject, IsString, MaxLength, MinLength, ValidateNested } from 'class-validator';
import { Type } from 'class-transformer';

export class PushKeysInput {
  @IsString()
  @MinLength(8)
  @MaxLength(256)
  p256dh!: string;

  @IsString()
  @MinLength(8)
  @MaxLength(256)
  auth!: string;
}

export class SubscribePushBody {
  @IsString()
  @MinLength(8)
  @MaxLength(1024)
  endpoint!: string;

  @IsObject()
  @ValidateNested()
  @Type(() => PushKeysInput)
  keys!: PushKeysInput;
}

export class UnsubscribePushBody {
  @IsString()
  @MinLength(8)
  @MaxLength(1024)
  endpoint!: string;
}
