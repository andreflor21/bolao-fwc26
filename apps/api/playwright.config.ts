import { defineConfig } from '@playwright/test';

/**
 * E2E API-level (sem browser). Requer um stack rodando:
 *   1. pnpm docker:up            (Postgres + Redis)
 *   2. prisma migrate deploy + prisma db seed
 *   3. API rodando com STRIPE_DRIVER=mock
 * Variáveis:
 *   E2E_BASE_URL  (default http://localhost:3001)
 *   DATABASE_URL  (usado só pra promover o usuário a admin — passo sem endpoint)
 */
export default defineConfig({
  testDir: './test/e2e',
  timeout: 60_000,
  fullyParallel: false,
  retries: 0,
  reporter: [['list']],
  use: {
    baseURL: process.env.E2E_BASE_URL ?? 'http://localhost:3001',
  },
});
