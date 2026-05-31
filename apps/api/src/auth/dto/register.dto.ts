import { IsBoolean, IsEmail, IsOptional, IsString, MaxLength, MinLength } from 'class-validator';
import { Transform } from 'class-transformer';

export class RegisterDto {
  @IsEmail()
  @Transform(({ value }) => (typeof value === 'string' ? value.toLowerCase().trim() : value))
  email!: string;

  @IsString()
  @MinLength(8)
  @MaxLength(128)
  password!: string;

  @IsString()
  @MinLength(2)
  @MaxLength(80)
  name!: string;

  /** WhatsApp opcional (formato livre, ex: +55 11 9...). */
  @IsOptional()
  @IsString()
  @MaxLength(20)
  whatsapp?: string;

  /** Opt-in pra entrar no grupo do WhatsApp do bolão. */
  @IsOptional()
  @IsBoolean()
  whatsappGroupOptIn?: boolean;
}
