import { plainToInstance } from 'class-transformer';
import { IsEnum, IsInt, IsOptional, IsString, MinLength, validateSync } from 'class-validator';

enum NodeEnv {
  Development = 'development',
  Test = 'test',
  Production = 'production',
}

class EnvVars {
  @IsEnum(NodeEnv)
  NODE_ENV: NodeEnv = NodeEnv.Development;

  @IsString()
  DATABASE_URL!: string;

  @IsOptional()
  @IsString()
  REDIS_HOST?: string;

  @IsOptional()
  @IsInt()
  REDIS_PORT?: number;

  @IsOptional()
  @IsInt()
  API_PORT?: number;

  @IsOptional()
  @IsString()
  API_HOST?: string;

  @IsOptional()
  @IsString()
  WEB_ORIGIN?: string;

  @IsString()
  @MinLength(16)
  JWT_SECRET!: string;

  @IsOptional()
  @IsString()
  JWT_ACCESS_TTL?: string;

  @IsOptional()
  @IsString()
  JWT_REFRESH_TTL?: string;

  @IsOptional()
  @IsInt()
  BCRYPT_COST?: number;

  @IsOptional()
  @IsString()
  EMAIL_FROM?: string;

  @IsOptional()
  @IsString()
  EMAIL_DRIVER?: string;

  @IsOptional()
  @IsString()
  STRIPE_DRIVER?: string;

  @IsOptional()
  @IsString()
  COMPETITION_LOCKS_AT?: string;

  @IsOptional()
  @IsString()
  COMPETITION_ENDS_AT?: string;

  @IsOptional()
  @IsInt()
  SUBSCRIPTION_AMOUNT_CENTS?: number;
}

export function validateEnv(config: Record<string, unknown>): EnvVars {
  const validated = plainToInstance(EnvVars, config, { enableImplicitConversion: true });
  const errors = validateSync(validated, { skipMissingProperties: false });
  if (errors.length > 0) {
    const msg = errors.map((e) => Object.values(e.constraints ?? {}).join(', ')).join('\n');
    throw new Error(`Invalid environment variables:\n${msg}`);
  }
  return validated;
}
