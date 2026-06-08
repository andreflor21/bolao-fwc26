import { IsOptional, IsString, MaxLength, MinLength } from 'class-validator';

export class SendBroadcastBody {
  @IsString()
  @MinLength(1)
  @MaxLength(4000)
  text!: string;

  /** Preset que originou o texto (apenas para auditoria/histórico). */
  @IsOptional()
  @IsString()
  presetKey?: string;
}
