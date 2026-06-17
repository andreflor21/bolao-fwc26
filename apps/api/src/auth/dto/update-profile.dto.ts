import { IsOptional, IsString, MaxLength } from 'class-validator';
import { Transform } from 'class-transformer';

export class UpdateProfileDto {
  /**
   * Chave Pix do usuário (CPF, e-mail, telefone ou chave aleatória). String
   * vazia limpa a chave (vira null).
   */
  @IsOptional()
  @Transform(({ value }) => {
    if (typeof value !== 'string') return value;
    const trimmed = value.trim();
    return trimmed === '' ? null : trimmed;
  })
  @IsString()
  @MaxLength(140)
  pixKey?: string | null;
}
