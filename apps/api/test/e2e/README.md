# E2E (Playwright, API-level)

Teste de fluxo completo **sem browser** — usa `request` do Playwright contra a
API rodando, e `pg` para o único passo sem endpoint (promover usuário a admin).

## Pré-requisitos (na sua máquina, com Docker)

```bash
# 1. Sobe Postgres + Redis
pnpm docker:up

# 2. Migrations + seed (competição + jogos)
pnpm --filter @bolao/api prisma migrate deploy
pnpm --filter @bolao/api prisma db seed

# 3. Sobe a API em modo mock de pagamento (em outro terminal)
STRIPE_DRIVER=mock NODE_ENV=development pnpm --filter @bolao/api dev
```

## Rodar

```bash
# DATABASE_URL é usado só pra promover o usuário a admin (passo sem endpoint).
# E2E_BASE_URL default = http://localhost:3001
DATABASE_URL="postgresql://bolao:bolao_dev@localhost:5432/bolao?schema=public" \
  pnpm --filter @bolao/api test:e2e
```

> Não precisa instalar browsers (`PLAYWRIGHT_SKIP_BROWSER_DOWNLOAD=1` no install) —
> o teste é só HTTP.

## O que valida
cadastro → checkout (mock) → mock-confirm → 72 palpites → submit →
promover admin (SQL) → lançar resultado oficial (3×1) → conferir que o ranking
reflete o acerto exato (points > 0, exactScores ≥ 1).

## Notas
- Cada run usa um e-mail único (`e2e-<timestamp>@bolao.test`); não colidem.
- Rode contra um banco **descartável** (o teste cria usuário e lança resultado
  de um jogo). Não aponte pra dados que você quer preservar.
