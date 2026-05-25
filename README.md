# Bolão Copa do Mundo FIFA 2026

Plataforma de bolão para a Copa do Mundo FIFA 2026 — implementação do TDD v1.4 (MVP).

> **Status atual**: Sprint 0 + Sprint 1 entregues (fundação, auth, subscription base, side-pools, seed).
> Próximos: Sprint 2 (palpites + engines), Sprint 3 (Stripe + ranking + prêmios), Sprint 4 (notificações).

## Stack

- **Backend**: NestJS 10 + Fastify adapter + Prisma + PostgreSQL 16 + Redis 7
- **Frontend**: React 18 + Vite + TypeScript + Tailwind + TanStack Query
- **Monorepo**: Turborepo + pnpm workspaces
- **Pagamento**: Stripe Pix (mockado no MVP atual)
- **E-mail**: Resend (mockado no MVP atual)

## Estrutura

```
.
├── apps/
│   ├── api/        NestJS + Fastify
│   └── web/        React + Vite
├── packages/
│   └── shared/     Tipos compartilhados
├── docker-compose.yml
└── turbo.json
```

## Pré-requisitos

- Node.js 20+
- pnpm 9+
- Docker + Docker Compose

## Setup inicial

```bash
# 1. Subir Postgres + Redis
pnpm docker:up

# 2. Instalar dependências
pnpm install

# 3. Copiar variáveis de ambiente
cp .env.example .env
cp .env.example apps/api/.env
cp .env.example apps/web/.env

# 4. Rodar migrations + seed (48 seleções, 72 jogos de grupo)
pnpm db:migrate
pnpm db:seed

# 5. Rodar API e Web em paralelo
pnpm dev
```

API: <http://localhost:3001/api/v1>
Web: <http://localhost:5173>
Prisma Studio: `pnpm db:studio`

## Endpoints disponíveis (Sprint 1)

| Endpoint | Método | Auth |
| --- | --- | --- |
| `/api/v1/auth/register` | POST | público |
| `/api/v1/auth/login` | POST | público |
| `/api/v1/auth/refresh` | POST | público |
| `/api/v1/auth/forgot-password` | POST | público |
| `/api/v1/auth/reset-password` | POST | público |
| `/api/v1/auth/me` | GET | JWT |
| `/api/v1/subscription/status` | GET | JWT |
| `/api/v1/subscription` | POST | JWT |
| `/api/v1/subscription/mock-confirm` | POST | JWT (dev only) |
| `/api/v1/side-pools` | POST | Subscriber |
| `/api/v1/side-pools` | GET | Subscriber |
| `/api/v1/side-pools/:id` | GET | Member |
| `/api/v1/side-pools/:id/invite` | GET | Owner |
| `/api/v1/side-pools/join/:token` | POST | Subscriber |

## Scripts úteis

```bash
pnpm dev           # API + Web em paralelo
pnpm build         # build de tudo
pnpm test          # rodar testes
pnpm lint          # lint
pnpm typecheck     # typecheck
pnpm db:reset      # zera o banco e recria
pnpm db:studio     # Prisma Studio
```

## Notas do MVP

- **Stripe**: driver mock no MVP. Sprint 3 troca por integração real.
- **Resend**: driver mock loga e-mails no console. Sprint 4 troca por envio real.
- **Bracket Engine, Score Engine, Prize Engine**: planejados para Sprint 2 e 3.
- **Deadline crítico**: 2026-06-11 (início da Copa). Lock global de palpites é automático.

## Compliance & jurídico

Ver TDD para detalhes sobre LGPD, enquadramento como bolão recreativo, CNPJ + KYB Stripe, política de reembolso (7 dias antes do início da Copa).
