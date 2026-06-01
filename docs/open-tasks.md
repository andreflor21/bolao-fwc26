# Tasks em aberto — continuar de onde paramos

> Snapshot atualizado em 2026-05-26 (final do dia). 12 tasks pendentes
> — Chunk 2 (Closure Flow) ✅ inteiramente concluído. Restam Sprint 4
> (10) + Polish UX (2).

---

## Onde paramos

**Concluído em 2026-05-26 (sessão noturna pt.2) — Stripe Checkout:**
- ✅ Migration adicionando `stripeCheckoutSessionId` + `checkoutSessionExpiresAt` em `subscriptions`
- ✅ `IPaymentDriver` reescrito: `createPixPaymentIntent` → `createCheckoutSession` (suporta `card`, `link`, `boleto`, `pix`, `apple_pay`)
- ✅ `StripePaymentDriver` agora cria Checkout Sessions hospedadas, parse de `checkout.session.completed`
- ✅ `MockPaymentDriver` simula sessions com URL `/pay/mock-success?sid=...`
- ✅ `PaymentService.createOrGetCheckoutSession` reutiliza session ativa não-expirada (24h TTL Stripe)
- ✅ Handler novo `checkout.session.completed` — ativa imediato pra card/Link/Apple Pay; boleto cai em `payment_intent.succeeded` mais tarde
- ✅ Frontend: `/pay` virou botão "Pagar agora" que redireciona pro Stripe Checkout; novas rotas `/pay/success` (polling de status) e `/pay/cancel`
- ✅ Mock-confirm via `POST /subscription/mock-confirm/:sessionId` (substitui o antigo sem param)
- ✅ Env: `STRIPE_CHECKOUT_METHODS=card,link,boleto` (Pix adicionável quando KYC liberar) + `STRIPE_BOLETO_EXPIRES_AFTER_DAYS=3`
- ✅ [docs/stripe-setup.md](docs/stripe-setup.md) reescrito pra Checkout (sem mais menções a Pix obrigatório)
- ✅ 4 testes novos cobrindo `checkout.session.completed` (com PI = ativa; sem PI = parqueada pra boleto)

**Concluído em 2026-05-26 (sessão noturna) — Push + cron D-1:**
- ✅ #49 Migration `push_subscriptions` aplicada
- ✅ #50 `NotificationModule` com `PushService` (web-push, VAPID, prune automático de 410/404) + 3 endpoints (`GET /push/vapid-public-key` público, `POST /push/subscribe`, `DELETE /push/subscribe`)
- ✅ #51 Service Worker [public/sw.js](apps/web/public/sw.js), hook [usePush](apps/web/src/lib/push.ts), banner [PushConsentBanner.tsx](apps/web/src/components/PushConsentBanner.tsx) integrado no Dashboard — só aparece pra subscriber/admin, persiste consent em localStorage
- ✅ #52 [ReminderCron](apps/api/src/notification/reminder.cron.ts) — `@Cron('55 15 10 6 *', { timeZone: 'America/Sao_Paulo' })`, varre subs ativos sem `submittedAt`, push idempotente via sentinel Redis `bolao:reminder-d1:sent`
- ✅ `ScheduleModule.forRoot()` movido pro `AppModule` (compartilhado entre ReconciliationCron + ReminderCron)
- ✅ VAPID keys de dev geradas via `npx web-push generate-vapid-keys` e gravadas no `.env`
- ✅ 12 specs novos (PushService: subscribe upsert + send + prune 404/410; ReminderCron: dispatch + idempotência + 0-candidatos)

**Concluído em 2026-05-26 (final do dia) — Stripe sandbox:**
- ✅ `STRIPE_DRIVER=stripe` ativo (mock fica como fallback CI/offline)
- ✅ Handler novo `charge.refunded` no webhook → marca subscription `refunded` e devolve role `player` (defensivo p/ refunds via dashboard / dispute auto-refund)
- ✅ `WebhookEvent` agora carrega `paymentIntentId` separado (extraído de `charge.payment_intent` / `refund.payment_intent`)
- ✅ Erros do Stripe SDK embrulhados em `StripeOperationError` com `request_id`, `type`, `code`, `decline_code` — fácil de rastrear no dashboard
- ✅ Mensagem de erro do "PI sem QR Pix" agora indica como ativar Pix
- ✅ [docs/stripe-setup.md](docs/stripe-setup.md) — checklist completo: ativar Pix → pegar keys → instalar stripe-cli → `stripe listen` → testar → prod
- ✅ 4 specs novos cobrindo charge.refunded (handle, idempotente, sem PI = no-op)

**Concluído em 2026-05-26 (Closure Flow inteiro + tie-break + tiebreak UI):**
- ✅ #43 `POST /admin/closure/finalize` idempotente + `GET /admin/closure/precheck` + `GET /admin/closure/snapshot`
- ✅ #44 `GET /admin/prizes/payout-report` (CSV via csv-stringify)
- ✅ #45 `POST /admin/prizes/payouts/:payoutId/mark-paid` (idempotente, preserva paid_at em re-call) + UI completa em [AdminPrizes.tsx](apps/web/src/pages/admin/AdminPrizes.tsx) com tabela, modal, stats e botão download CSV
- ✅ #46 `/admin/closure` UI: precheck em tempo real, confirmação dupla, flag override pra KO incompleto
- ✅ **Bonus** — Tie-break cascade refeito (FIFA Euro-style H2H first → overall GD/GF → manual → FIFA), specs novas em [group-standings.spec.ts](apps/api/src/domain/bracket/group-standings.spec.ts)
- ✅ **Bonus** — UI manual tie-break resolver em [/bracket](apps/web/src/pages/BracketPreview.tsx) (botões ▲▼ touch-friendly, sem dep nova) + endpoint `PUT /guesses/manual-tiebreak`
- ✅ Helper `apiDownload()` em [api.ts](apps/web/src/lib/api.ts) — download autenticado de blobs

**Métricas atualizadas:**
- 113/113 testes passando em 10 suítes
- api + web: typecheck e lint sem warnings

---

**Concluído na sessão anterior (2026-05-25):**
- ✅ Sprint 2 inteiro (palpites, bracket engine, score engine, admin match endpoint, UI de palpites/bracket)
- ✅ Sprint 3 parcial: Stripe Pix completo (driver mock+real, webhook idempotente, reconciliation cron, refund), Ranking + Redis + Prize Engine, UIs `/pay` `/ranking` `/prizes`
- ✅ Refactor do bracket: R32 oficial FIFA da imagem (matches 73-88), best-third assignment com constraints, R16+ classic symmetric, KO scoring 15+15+placar (máx 40), lock 1h antes via env, UI `/knockout-guesses` com "quem passa" em empate
- ✅ Engine refeito: R16+ resolvido pelos placares do jogador (drop predição FIFA-rank), `advancesTeamCode` para empates
- ✅ Bandeiras (flagcdn.com SVG) em MatchCard, BracketSlot, BracketPreview, KnockoutGuesses
- ✅ Bugfix Stripe rawBody (substituído fastify-raw-body por `NestFactory.create({ rawBody: true })`)
- ✅ Bugfix `api.ts` helper (Content-Type só quando há body, fim do "Body cannot be empty")
- ✅ Bugfix `BracketPreview` (IDs `FINAL`/`TP` → `F-104`/`TP-103`)
- ✅ **Painel admin (chunk 1)**: AuthProvider com `adminView`+`effectiveRole`+`toggleAdminView`, AdminToggle no header, AdminRoute+AdminLayout com sidebar, `/admin/matches` completa com preview-then-confirm, `/admin/reconciliation` com botão recompute global, endpoint `POST /admin/recompute`

**Estado da árvore:** working tree COM mudanças não-commitadas
(Closure Flow inteiro + tie-break refactor + UI resolver + AdminPrizes
+ AdminClosure). Lembrar de commitar antes de começar Sprint 4.

**Métricas atualizadas (sessão noturna pt.2 2026-05-26):**
- 90/90 → 113/113 → 116/116 → 128/128 → 132/132 testes (12 suítes)
- Engines puros com cobertura ≥95% statements
- Stripe Checkout (card+link+boleto) ativo, webhooks `checkout.session.completed` + `charge.refunded` cobertos
- Push + cron D-1 funcionando ponta-a-ponta
- Pix preparado pra ativar via `STRIPE_CHECKOUT_METHODS` quando KYC BR liberar (60 dias)

---

## Chunk 2 — Closure Flow ✅ CONCLUÍDO

Tasks #43, #44, #45 e #46 todas entregues em 2026-05-26 + bonus do
tie-break FIFA-style (H2H first) + UI manual tiebreak resolver. Specs
mantidas abaixo como referência histórica do que ficou pronto.

### Task 43 — `POST /admin/closure/finalize` (one-shot idempotente) ✅
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

### Task 44 — `GET /admin/prizes/payout-report` (CSV) ✅
**Backend.** Endpoint que retorna `text/csv`:
```
posicao,user_id,nome,email,categoria,valor_brl,paid_at,payment_reference
```
- Usa `csv-stringify` (já em dependencies)
- `Content-Type: text/csv`
- `Content-Disposition: attachment; filename="payouts-fifa-wc-2026.csv"`
- Lê de `prize_payouts` joinando com `users`
- Disponível apenas após `closureStatus = 'finalized'`

### Task 45 — `POST /admin/prizes/payouts/:payoutId/mark-paid` + UI ✅
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

### Task 46 — Página `/admin/closure` com confirmação dupla ✅
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

---

## Chunk 4 — Polish UX (2 tasks)

### Task 57 — Responsividade mobile / tablet completa

**Frontend.** O app foi escrito mirando desktop. Antes do soft-launch a
gente tem que funcionar em telefone (a maior parte do tráfego de bolão
acontece no celular durante intervalo de jogo). Pass de UX em toda a
área autenticada:

- **Header / Layout** ([apps/web/src/components/Layout.tsx](apps/web/src/components/Layout.tsx)):
  menu hambúrguer em `< md`; nav vertical em drawer
- **AdminLayout** ([apps/web/src/pages/admin/AdminLayout.tsx](apps/web/src/pages/admin/AdminLayout.tsx)):
  sidebar vira barra horizontal scrollable no topo em `< lg`
- **Tabelas de ranking / payouts / admin/matches**: container com
  `overflow-x-auto` + colunas secundárias escondidas em `< sm` (data,
  cidade), card mode em `< md` quando faz sentido
- **MatchCard / KnockoutGuesses**: bandeiras menores em mobile, layout
  vertical do placar em telas estreitas, botões de placar mais largos
  (touch target ≥ 44 px)
- **Modais (confirm, mark-paid, closure)**: max-w respeitando viewport,
  scroll interno em mobile
- **BracketPreview**: já tem scroll horizontal — confirmar que funciona
  bem em mobile e adicionar swipe hint na primeira visita
- **Footer fixo do /guesses**: stack vertical em `< sm` (atualmente
  texto + botão na mesma linha, espreme demais)
- **Forms (login, register, forgot, reset)**: padding e width
  adequados, max-w-sm centralizado em mobile

Tailwind breakpoints já configurados (`sm 640`, `md 768`, `lg 1024`,
`xl 1280`). Adicionar `2xl` se necessário pro bracket. Testar em DevTools
nas resoluções: 360×800 (Android low-end), 390×844 (iPhone 14), 768×1024
(iPad), 1280×800 (laptop).

**Checklist por página:**
- [ ] `/` Landing
- [ ] `/login` `/register` `/forgot-password` `/reset-password`
- [ ] `/dashboard`
- [ ] `/guesses` (footer fixo + cards de grupo + modal confirm)
- [ ] `/bracket`
- [ ] `/knockout-guesses` (32 fixtures + draw selector)
- [ ] `/pay` (Stripe Pix QR + instruções)
- [ ] `/ranking` (tabela com colunas hideable)
- [ ] `/prizes` (cards de categoria)
- [ ] `/side-pools` e `/join/:token`
- [ ] `/admin/matches` (preview-then-confirm + tabela)
- [ ] `/admin/prizes` (tabela payout + modal mark-paid)
- [ ] `/admin/closure` (botão grande + modal dupla)
- [ ] `/admin/reconciliation` (botão recompute)

### Task 58 — UI de manual tie-break override em `/guesses`

**Backend já pronto** (vem como parte deste chunk em paralelo com #43):
- `manualTiebreakOrder: Record<GroupLetter, string[]>` opcional no
  payload de `BracketPrediction`
- Engine respeita a ordem fornecida quando todos os critérios
  automáticos esgotam (pts H2H → GD H2H → GF H2H → GD overall → GF
  overall → manualTiebreakOrder → FIFA rank fallback determinístico)
- DTO de bracket preview expõe `groupsNeedingManualOrder: GroupLetter[]`
  pra UI saber onde mostrar o widget

**Frontend** — após o último jogo de cada grupo (no `/guesses`):
- Quando `groupsNeedingManualOrder` traz pelo menos um grupo, renderizar
  um banner dourado "1 grupo precisa de desempate manual" linkando pra
  seção
- No final da página `/guesses` (antes do footer fixo), seção
  "Resolver empates" listando cada grupo problemático
- Para cada grupo: cards drag-and-drop dos times empatados com a
  ordem 1º/2º/3º/4º já preenchida pela engine; o jogador só reordena
  o subconjunto em conflito
- Salvar `manualTiebreakOrder` junto com o submit (passa pelo
  `bracket_predictions.payload`)
- Lib de drag-and-drop: usar `@dnd-kit/core` + `@dnd-kit/sortable`
  (precisará `pnpm --filter @bolao/web add @dnd-kit/core @dnd-kit/sortable`)

---

## Chunk 5 — Próximas features (backlog, pedido em 2026-05-31)

### Task 59 — Ver palpites de outros jogadores
**Objetivo.** Depois que os palpites travam (lock da Copa / `submittedAt`),
permitir que um jogador veja os palpites de outros participantes — começando
pelos membros dos seus bolões paralelos e/ou pelo ranking geral.

**Considerações.**
- **Privacidade/integridade:** NUNCA expor palpites enquanto a janela está
  aberta (`isOpen`/antes do lock) — só liberar leitura após o lock para não
  permitir cópia. Gatear no backend, não só na UI.
- Backend: novo endpoint `GET /guesses/by-user/:userId` (ou
  `/side-pools/:id/guesses`) que valida (a) competição travada e (b) que o
  solicitante tem direito de ver (mesmo bolão / ranking público). Reusar o
  shape de `MyGuessesDto` mas read-only e sem score sensível além do já
  público.
- Frontend: na linha do ranking / lista de membros do bolão, botão "ver
  palpites"; reaproveitar `MatchCard` em modo `readOnly` mostrando o placar
  do outro + resultado oficial + pontos (já temos `score` no DTO agora).

### Task 60 — IA no WhatsApp com estatísticas do grupo
**Objetivo.** Bot/IA conectada a um grupo de WhatsApp que envia, sob demanda
ou agendado, estatísticas agregadas dos palpites dos participantes:
- Top 3 placares mais palpitados (por jogo ou da rodada)
- % de palpites em vitória do time A
- % de palpites em vitória do time B
- % de palpites em empate

**Considerações.**
- **Agregação backend:** endpoint `GET /matches/:id/stats` (ou
  `/rounds/:n/stats`) que calcula, sobre os palpites SUBMETIDOS, a
  distribuição de placares (top 3) e os percentuais A/empate/B. Cachear em
  Redis (TTL curto) — pode ser pesado com N grande.
- **Privacidade:** só números agregados, nunca palpite individual atrelado a
  nome antes do lock. Idealmente só liberar stats após o lock também.
- **Canal WhatsApp:** decidir provedor — WhatsApp Cloud API (Meta) oficial vs.
  biblioteca não-oficial (`whatsapp-web.js`, risco de ban). Para grupo, a
  Cloud API tem limitações de envio a grupos; avaliar enviar via número
  comercial ou template. Documentar trade-offs antes de implementar.
- **IA:** usar o mesmo cliente Anthropic já configurado (`ANTHROPIC_API_KEY`)
  pra formatar a mensagem em linguagem natural a partir do JSON de stats.
- **Memória do projeto:** já temos infra de e-mail (SendPulse) e push; o
  WhatsApp seria um 3º canal — provavelmente um novo `notification` driver +
  cron/endpoint de disparo.

---

## Ordem sugerida para amanhã

1. **Commit** das mudanças pendentes do Closure Flow + tie-break refactor + Stripe
2. **Sprint 4 por sub-grupo** (Email parado aguardando SendPulse):
   - ~~Email (#47-48)~~ — **bloqueado** aguardando liberação SendPulse
   - Push (#49-51) + cron (#52) juntos: features de retenção
   - Observabilidade (#53-54): antes do soft launch
   - E2E (#55) + Hardening (#56): última semana pré-launch
3. **Polish UX (#57-58)**: depois do Sprint 4 mas antes do soft-launch.
   Responsividade é gating pra launch; UI de manual tie-break é bem
   mais raro de disparar mas precisa estar lá pra MVP completo.

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
