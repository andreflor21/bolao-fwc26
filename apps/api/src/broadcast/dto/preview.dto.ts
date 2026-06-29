import { IsIn, IsInt, IsOptional, IsString, IsUUID, Max, Min } from 'class-validator';
import type { BroadcastPresetKey } from '../broadcast-ai.service';

const PRESET_KEYS = [
  'top-guesses-today',
  'top-guesses-knockout',
  'win-draw-probabilities',
  'match-result-recap',
  'reminder-lock-soon',
  'who-is-nailing',
] as const;

export class PreviewBroadcastBody {
  @IsString()
  @IsIn(PRESET_KEYS as unknown as string[])
  presetKey!: BroadcastPresetKey;

  /** Jogo alvo para presets que dependem de um match específico. */
  @IsOptional()
  @IsUUID()
  matchId?: string;

  /** Placar atual do jogo (preset "who-is-nailing") — informado pelo admin no disparo. */
  @IsOptional()
  @IsInt()
  @Min(0)
  @Max(30)
  homeGoals?: number;

  @IsOptional()
  @IsInt()
  @Min(0)
  @Max(30)
  awayGoals?: number;
}
