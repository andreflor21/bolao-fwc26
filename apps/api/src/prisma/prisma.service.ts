import { Injectable, OnModuleDestroy, OnModuleInit, Logger } from '@nestjs/common';
import { PrismaClient } from '@prisma/client';
import { PrismaPg } from '@prisma/adapter-pg';

/**
 * Prisma 7+ exige um driver adapter no construtor — a URL não vem mais
 * do datasource em schema.prisma. Lemos DATABASE_URL aqui (mesma fonte
 * que prisma.config.ts usa para Migrate) e passamos pro adapter `pg`.
 */
function buildAdapter(): PrismaPg {
  const url = process.env.DATABASE_URL;
  if (!url) throw new Error('DATABASE_URL is required to bootstrap PrismaService');
  return new PrismaPg({ connectionString: url });
}

@Injectable()
export class PrismaService extends PrismaClient implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(PrismaService.name);

  constructor() {
    super({
      adapter: buildAdapter(),
      log: process.env.NODE_ENV === 'development' ? ['warn', 'error'] : ['error'],
    });
  }

  async onModuleInit(): Promise<void> {
    await this.$connect();
    this.logger.log('Prisma connected to PostgreSQL');
  }

  async onModuleDestroy(): Promise<void> {
    await this.$disconnect();
  }
}
