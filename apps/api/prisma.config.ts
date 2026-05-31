import 'dotenv/config';
import { defineConfig } from 'prisma/config';
import { PrismaPg } from '@prisma/adapter-pg';

/**
 * Prisma 7 moved the connection URL out of schema.prisma into this config
 * file. CLI (migrate/studio) reads `datasource.url`; runtime adapter
 * (`adapter`) is the same connection wrapped by the pg driver. The
 * application's own PrismaService instantiates its own adapter at boot.
 */
function databaseUrl(): string {
  const url = process.env.DATABASE_URL;
  if (!url) throw new Error('DATABASE_URL is required');
  return url;
}

export default defineConfig({
  schema: 'prisma/schema.prisma',
  datasource: { url: databaseUrl() },
  migrations: {
    path: 'prisma/migrations',
    seed: 'ts-node --transpile-only prisma/seed.ts',
  },
  adapter: () => new PrismaPg({ connectionString: databaseUrl() }),
});
