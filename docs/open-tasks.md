# Tasks em aberto — continuar de onde paramos

> Snapshot tirado em 2026-05-25 ao final da sessão. 14 tasks pendentes,
> divididas em 2 chunks (Closure Flow + Sprint 4).

---

## Onde paramos

**Concluído nesta sessão:**
- ✅ Sprint 2 inteiro (palpites, bracket engine, score engine, admin match endpoint, UI de palpites/bracket)
- ✅ Sprint 3 parcial: Stripe Pix completo (driver mock+real, webhook idempotente, reconciliation cron, refund), Ranking + Redis + Prize Engine, UIs `/pay` `/ranking` `/prizes`
- ✅ Refactor do bracket: R32 oficial FIFA da imagem (matches 73-88), best-third assignment com constraints, R16+ classic symmetric, KO scoring 15+15+placar (máx 40), lock 1h antes via env, UI `/knockout-guesses` com "quem passa" em empate
- ✅ Engine refeito: R16+ resolvido pelos placares do jogador (drop predição FIFA-rank), `advancesTeamCode` para empates
- ✅ Bandeiras (flagcdn.com SVG) em MatchCard, BracketSlot, BracketPreview, KnockoutGuesses
- ✅ Bugfix Stripe rawBody (substituído fastify-raw-body por `NestFactory.create({ rawBody: true })`)
- ✅ Bugfix `api.ts` helper (Content-Type só quando há body, fim do "Body cannot be empty")
- ✅ Bugfix `BracketPreview` (IDs `FINAL`/`TP` → `F-104`/`TP-103`)
- ✅ **Painel admin (chunk 1)**: AuthProvider com `adminView`+`effectiveRole`+`toggleAdminView`, AdminToggle no header, AdminRoute+AdminLayout com sidebar, `/admin/matches` completa com preview-then-confirm, `/admin/reconciliation` com botão recompute global, endpoint `POST /admin/recompute`

**Estado da árvore:** working tree COM mudanças não-commitadas (Painel admin
chunk 1 inteiro + bugfix BracketPreview IDs). Não esquecer de commitar
amanhã antes de começar.

**Métricas atuais:**
- 90/90 testes passando em 9 suítes
- api + web: typecheck e lint sem warnings
- Engines puros com cobertura ≥95% statements

---

## Chunk 2 — Closure Flow (4 tasks)

Objetivo: admin consegue encerrar a competição quando o último jogo tiver
resultado oficial, gerar a tabela de payouts, exportar CSV, e marcar cada
pagamento como feito.

### Task 43 — `POST /admin/closure/finalize` (one-shot idempotente)
**Backend.** Em `apps/api/src/admin/`:
- Novo endpoint `POST /admin/closure/finalize` (RolesGuard admin)
- Valida: todos os 72 jogos de grupo têm `homeGoalsOfficial` setado.
  Para KO, decidir se valida também — provavelmente sim, mas como ainda
  não há registros de match KO no DB, por ora valida só grupo + uma flag
  override `confirmIncompleteKnockouts: true` no body.
- Chama `PrizeEngine.finalize(totalSubscribers, amountCents, ranking, exactScores)`
  com dados atuais. PrizeEngine já existe em `src/domain/prize/prize-engine.ts`.
- Persiste array de `PrizePayout` no Postgres (modelo já existe em
  schema.prisma — categoria, amountCents, percentage, userId nullable).
- Marca `competition.closureStatus = 'finalized'`.
- **Idempotente**: se já finalizado, retorna o snapshot existente sem
  recriar payouts.
- Retorna `{ payouts: PrizePayoutDto[], totalDistributed: number }`.

Arquivos sugeridos:
- `apps/api/src/admin/admin-closure.controller.ts`
- `apps/api/src/admin/admin-closure.service.ts`
- DTOs em `apps/api/src/admin/dto/finalize.dto.ts`

### Task 44 — `GET /admin/prizes/payout-report` (CSV)
**Backend.** Endpoint que retorna `text/csv`:
```
posicao,user_id,nome,email,categoria,valor_brl,paid_at,payment_reference
```
- Usa `csv-stringify` (já em dependencies)
- `Content-Type: text/csv`
- `Content-Disposition: attachment; filename="payouts-fifa-wc-2026.csv"`
- Lê de `prize_payouts` joinando com `users`
- Disponível apenas após `closureStatus = 'finalized'`

### Task 45 — `POST /admin/prizes/:userId/mark-paid` + UI
**Backend:**
- Body: `{ paymentReference?: string }`
- Atualiza `paid_at = NOW()`, `paid_by_admin_id = current admin`, `payment_reference`
- Idempotente: re-chamada atualiza apenas `payment_reference` se mudou
- Retorna o payout atualizado

**Frontend** — substituir o placeholder em
[apps/web/src/pages/admin/AdminPrizes.tsx](apps/web/src/pages/admin/AdminPrizes.tsx):
- Tabela com colunas: categoria, posição, jogador (nome+email), valor BRL,
  status (Pendente / ✓ Pago em <data>), botão "Marcar como pago"
- Botão "Baixar CSV" no topo direito (`<a href="/api/v1/admin/prizes/payout-report">`)
- Modal de mark-paid: input opcional para `paymentReference` (ex: txid Pix)
- React Query: `useQuery(['admin-payouts'])` para listar, `useMutation` para mark-paid

### Task 46 — Página `/admin/closure` com confirmação dupla
**Frontend** — substituir placeholder em
[apps/web/src/pages/admin/AdminClosure.tsx](apps/web/src/pages/admin/AdminClosure.tsx):
- Pré-condição visível: "73/72 jogos com resultado oficial" (status em verde
  ou vermelho conforme estado)
- Botão grande dourado "Encerrar competição" desabilitado até pré-condições
  ok
- Modal de confirmação dupla:
  - Texto: "Esta ação é IRREVERSÍVEL. Após encerrar, palpites travam de
    vez e os prêmios são distribuídos conforme o ranking atual."
  - Checkbox "Eu entendo que essa ação é irreversível" (obrigatório)
  - Botão "Confirmar encerramento" só libera após checkbox
- Após sucesso: redireciona para `/admin/prizes`

---

## Chunk 3 — Sprint 4 (10 tasks)

### Email (#47 + #48)

**Task 47 — Driver Resend**
- `apps/api/src/email/drivers/resend-email.driver.ts` implementando
  `IEmailDriver` via SDK `resend` (já em deps)
- `EmailModule` factory escolhe driver por `EMAIL_DRIVER` env (`mock` |
  `resend`); rejeita `mock` em `NODE_ENV=production`
- Resend API key via `RESEND_API_KEY`

**Task 48 — 7 templates**
Já existem: welcome, password-reset, payment-confirmed (mock string).
Adicionar:
- `palpites-locked` (gatilho automático 11/06 15:55 BRT)
- `top-position-changed` (worker — quando jogador entra/sai do top 10)
- `voce-foi-premiado` (após closure, varre prize_payouts e envia para
  cada user_id != null)
- `pix-payment-instructions` (após admin marca pago, manda o PIX-key do
  user pra confirmar recebimento)
Templates HTML com `<style>` inline (compatibilidade com clientes de email).
Reutilizar paleta do app (dark midnight + emerald + gold).

### Push notifications (#49 + #50 + #51)

**Task 49 — Schema PushSubscription**
Migration nova:
```prisma
model PushSubscription {
  id          String   @id @default(uuid()) @db.Uuid
  userId      String   @map("user_id") @db.Uuid
  endpoint    String
  keysP256dh  String   @map("keys_p256dh")
  keysAuth    String   @map("keys_auth")
  userAgent   String?  @map("user_agent")
  createdAt   DateTime @default(now()) @map("created_at")

  user User @relation(fields: [userId], references: [id], onDelete: Cascade)

  @@unique([userId, endpoint])
  @@map("push_subscriptions")
}
```
`pnpm --filter @bolao/api prisma migrate dev --name add_push_subscriptions`

**Task 50 — PushModule backend**
- `apps/api/src/notification/push.module.ts`
- `PushService.send(userId, payload: { title, body, url? })` usando lib `web-push` (já em deps)
- Endpoints:
  - `GET /push/vapid-public-key` (público) — retorna `VAPID_PUBLIC_KEY`
  - `POST /push/subscribe` (auth) — body com endpoint+keys, upsert
  - `POST /push/unsubscribe` (auth) — remove por endpoint
- Env: `VAPID_PUBLIC_KEY`, `VAPID_PRIVATE_KEY`, `VAPID_SUBJECT`
- Gerar VAPID keys 1× com: `npx web-push generate-vapid-keys`

**Task 51 — Frontend push opt-in**
- `apps/web/public/sw.js` — service worker que escuta `push` event e exibe
  notification
- `apps/web/src/lib/push.ts` — hook `usePush()` com `subscribeToPush()` +
  `unsubscribeFromPush()` (usa `PushManager.subscribe`)
- `apps/web/src/components/PushConsentBanner.tsx` — banner LGPD após
  primeiro login pós-paywall: "Quer receber notificações de início de
  jogo e atualizações do ranking?" [Sim, ativar / Talvez depois]
- Salvar consentimento em `localStorage` (`bolao.pushConsent.v1`)

### Cron (#52)

**Task 52 — Reminder D-1**
- `apps/api/src/scheduler/reminder.cron.ts`
- `@Cron('55 15 10 6 *', { timeZone: 'America/Sao_Paulo' })` → 10/06 15:55 BRT
- Varre subscribers ativos sem `submittedAt` em group palpites
- Envia email + push (se opt-in)

### Observabilidade (#53 + #54)

**Task 53 — Pino structured logs**
- `pnpm --filter @bolao/api add nestjs-pino pino pino-pretty pino-http`
  (já estão em deps)
- `main.ts`: substituir `bufferLogs: true` por `LoggerModule.forRoot()` do
  nestjs-pino
- Header `x-request-id` propagado; gera UUID se ausente
- `pino-pretty` só em `NODE_ENV=development`
- Env `LOG_LEVEL` (default `info`)

**Task 54 — Sentry**
- **Back**: `main.ts` faz `Sentry.init({ dsn: process.env.SENTRY_DSN, ... })`
  antes do `NestFactory.create`
- **Front**: `apps/web/src/main.tsx` faz `Sentry.init` no entry; envolve
  o `<App />` com `<Sentry.ErrorBoundary>`
- Skip em dev a menos que `SENTRY_ENVIRONMENT=development` explicitamente
- Dispara test exception com `?sentry-test=1` query param

### E2E (#55)

**Task 55 — Playwright**
- `pnpm --filter @bolao/api add -D @playwright/test`
- `apps/api/test/e2e/full-flow.spec.ts`:
  - Setup: docker-compose up + prisma migrate deploy + prisma db seed
  - Cenário: cadastro → POST /subscription/payment-intent → mock-confirm →
    submit 72 palpites → SQL promover user para admin → toggle admin →
    /admin/matches inserir resultado → verificar /ranking + /prizes
- Roda em CI via GitHub Actions

### Polish (#56)

**Task 56 — Rate limit por endpoint + CSP estrito**
- `ThrottlerModule` com múltiplos buckets:
  - `login`: 5 req / 15 min / IP
  - `mutations`: 30 req / min / user
  - `webhook`: sem throttle (já tem `@SkipThrottle`)
- `helmet`: CSP estrito (`default-src 'self'`; allowlist explícito para
  `https://flagcdn.com`, `https://*.stripe.com`, `https://*.sentry.io`,
  `https://r2.cloudflarestorage.com` se for usar Resend hosted images)

---

## Ordem sugerida para amanhã

1. **Commit** das mudanças pendentes (chunk 1 admin + bugfix BracketPreview)
2. **Closure Flow inteiro (#43→#46)** — destrava o fim-de-jogo do MVP
3. **Sprint 4 por sub-grupo**:
   - Email primeiro (#47-48): valor visível imediato
   - Push (#49-51) + cron (#52) juntos: features de retenção
   - Observabilidade (#53-54): antes do soft launch
   - E2E (#55) + Hardening (#56): última semana pré-launch

## Lembretes técnicos

- **Deps já instaladas** mas ainda não usadas: `nestjs-pino`, `pino`,
  `pino-pretty`, `pino-http`, `@sentry/*`, `resend`, `web-push`,
  `@types/web-push`, `bullmq`, `@nestjs/bullmq`, `ioredis`,
  `@nestjs/schedule`, `csv-stringify`, `qrcode`.
- **Env vars já no `.env.example`** mas ainda sem valor real:
  `VAPID_*`, `SENTRY_DSN`, `RESEND_API_KEY`, `EMAIL_DRIVER=mock`
  (trocar para `resend` em prod).
- **Migration pendente**: `push_subscriptions` (task 49). Lembre de rodar
  `prisma migrate dev` antes do task 50.
- **Tests target**: manter cobertura ≥80% nos engines puros e ≥60% no
  service layer. Não deixar warnings de lint.
