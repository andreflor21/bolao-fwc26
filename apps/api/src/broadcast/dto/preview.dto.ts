import { IsIn, IsOptional, IsString, IsUUID } from 'class-validator';
import type { BroadcastPresetKey } from '../broadcast-ai.service';

const PRESET_KEYS = [
  'top-guesses-today',
  'win-draw-probabilities',
  'match-result-recap',
  'reminder-lock-soon',
] as const;

export class PreviewBroadcastBody {
  @IsString()
  @IsIn(PRESET_KEYS as unknown as string[])
  presetKey!: BroadcastPresetKey;

  /** Jogo alvo para presets que dependem de um match específico. */
  @IsOptional()
  @IsUUID()
  matchId?: string;
}
