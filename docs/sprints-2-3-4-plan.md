# Plano — Sprints 2, 3 e 4 do Bolão Copa 2026

> Persistido em 2026-05-25. Fonte da verdade para a execução das 3 sprints
> restantes (entrega em 2026-06-11). Não editar sem alinhamento com o PO.

## Contexto

Sprint 0 + Sprint 1 já foram entregues: monorepo Turborepo + Docker, AuthModule
completo (register/login/refresh/forgot-reset/JWT), SubscriptionModule base com
mock de pagamento, SidePoolModule com convite, EmailService mockado, schema
Prisma completo com 14 modelos, seed com 48 seleções e 72 jogos da fase de
grupos (BRT→UTC), frontend React+Vite com design system dark midnight + emerald
+ gold.

Faltam as 3 sprints restantes do TDD para chegar ao MVP funcional até
**11/06/2026** (deadline imóvel). Decisões adicionais firmadas com o PO:

- **Stripe**: conta PJ já configurada — substituir o driver mock por integração
  real (sem fallback mock em prod, mas mantém o driver mock para dev/CI).
- **Painel admin**: escopo operacional do TDD apenas (resultados, recompute,
  finalizar competição, gerar/marcar payouts). Sem moderação de usuários no
  MVP.
- **Toggle de visão admin↔jogador**: switch no header (mesmo URL), persistido
  em localStorage. Admin em modo jogador vê exatamente o mesmo que um
  subscriber comum.

A pirâmide segue o TDD: testes unitários (Jest) cobrem engines críticos a 80%+,
integração com Testcontainers Postgres para fluxos de webhook/payment,
Playwright para E2E dos fluxos críticos no fim do Sprint 4.

---

## Sprint 2 — Palpites + Engines (Dias 10–16)

Objetivo: jogador inscrito consegue submeter os 72 palpites de grupo, vê seu
chaveamento previsto e a aplicação calcula pontuação corretamente quando o
resultado oficial chega.

### Backend

**`src/domain/bracket/`** — engine puro (sem NestJS, sem Prisma), 100%
testável:

- `fifa-2026-bracket-map.ts` — constante imutável com o mapeamento oficial da
  Rodada de 32 (ex: `R32-1: 1A vs 3C/D/E/F`, etc.). Versionada em código, não
  editável por admin.
- `group-standings.ts` — função `computeStandings(groupMatches, fifaRanks)`
  aplica em cascata: pts → saldo → gols marcados → confronto direto (sub-loop
  entre empatados) → rank FIFA (fair play não simulável, usar como tie-break
  determinístico marcado como `aux`).
- `best-third-places.ts` — função
  `pickBestThirds(allGroupStandings, fifaRanks)` retorna os 8 melhores 3ºs com
  critérios FIFA.
- `bracket-engine.ts` — orquestra: standings de 12 grupos → 8 melhores 3ºs →
  R32 (mapping fixo) → propaga vencedores previstos pelo jogador através de
  R16/QF/SF/Final + disputa de 3º.
- Testes: `*.spec.ts` em cada arquivo. Cobertura mínima: empate triplo dentro
  de grupo, todos critérios de tie-break, simulação aleatória com 1000 palpites
  validando que sempre gera bracket válido.

**`src/domain/scoring/score-engine.ts`** — função pura
`scoreGuess(guess, official)` retorna `{ points, ruleApplied }` aplicando
cascata 10/8/6/4/2/0 (primeiro match ganha). Testes cobrem cada regra + casos
de borda (0×0 acertado, vitória sem placar, etc.).

**`src/guess/`** (NestJS module):

- `guess.controller.ts`: `GET /guesses` (lista palpites próprios),
  `PUT /guesses/group-stage` (salva rascunho), `POST /guesses/submit` (valida
  72 palpites preenchidos, chama BracketEngine, persiste palpites de mata-mata
  com `isDerived=true`, salva snapshot em `bracket_predictions`),
  `GET /guesses/bracket-preview`.
- `guess.service.ts`: valida lock global por timestamp do servidor
  (`competitionService.assertOpen()`), valida que jogador é subscriber ativo,
  valida que `homeGoals`/`awayGoals` estão em 0–15, faz tudo em transação para
  garantir atomicidade entre `guesses` + `bracket_predictions`.
- Após o lock (NOW() ≥ `competition.locksAt`), retorna 403 com
  `LOCKED_COMPETITION` em qualquer mutação.

**`src/competition/competition.service.ts`** — método único `assertOpen()` que
checa `NOW()` no Postgres (não no relógio da aplicação) via
`prisma.$queryRaw`. Reutilizado pelo GuessService e por endpoints de
subscription.

**`src/admin/match.controller.ts`** — endpoint
`PUT /admin/matches/:id/result` aceita
`{ homeGoals, awayGoals, confirmPreview: true }`. Primeira chamada sem
`confirmPreview` devolve preview do impacto (quantos jogadores afetados,
mudança de ranking estimada); segunda chamada com `confirmPreview: true`
aplica. Idempotente: registrar duas vezes o mesmo resultado é no-op. Salvar
resultado dispara enfileiramento de recálculo de scores e ranking (job BullMQ
— implementado nesse sprint só com handler in-process; Redis/BullMQ entra no
Sprint 3).

### Frontend

**`src/pages/Guesses.tsx`**: lista 72 jogos agrupados por rodada (1, 2, 3) e
por grupo. Cada jogo tem dois inputs numéricos (0–15) lado a lado com bandeiras
dos times e horário em BRT. Auto-save de rascunho a cada 2s (debounce) via
`PUT /guesses/group-stage`. Botão fixo "Submeter palpites finais" no rodapé
com confirmação modal (mostra contagem de palpites preenchidos, alerta que
após submissão o lock é definitivo no apito inicial).

**`src/pages/BracketPreview.tsx`**: visualiza o chaveamento previsto pelo
jogador (8 colunas: R32 → R16 → QF → SF → Final/3º lugar). Reaproveita classes
`card-glow`, `text-shimmer`, fonte `font-display`. Read-only após o lock;
antes do lock, link "Editar palpites".

**`src/components/MatchCard.tsx`** + **`src/components/BracketSlot.tsx`** —
componentes reutilizáveis em ambas as telas.

### Critérios de aceitação Sprint 2

- 72 palpites podem ser salvos em rascunho e submetidos.
- Após submissão, `bracket_predictions` tem 1 registro por jogador com
  snapshot JSON do mata-mata previsto.
- Mata-mata previsto sempre tem 16+8+4+2+1+1 = 32 jogos com times válidos.
- Tentativa de editar após `competition.locksAt` retorna 403.
- Admin registra resultado → ScoreEngine roda → `guess_scores` populado com
  pontos corretos para todos os jogadores.
- Cobertura unitária: BracketEngine ≥ 90%, ScoreEngine = 100%.

---

## Sprint 3 — Pagamento + Ranking + Prêmios + Admin (Dias 17–23)

Objetivo: usuário paga via Pix real, vê ranking ao vivo + prêmios estimados,
admin tem painel completo para operar a competição.

### Stripe Pix (real)

**`src/payment/stripe.module.ts`** + **`stripe.service.ts`**:

- Driver real usando `stripe` SDK (v16+). Driver mock continua disponível via
  `STRIPE_DRIVER=mock` para CI e dev.
- `createPixPaymentIntent({ userId, amountCents })` chama
  `stripe.paymentIntents.create({ amount, currency: 'brl', payment_method_types: ['pix'], metadata: { userId, competitionId } })`,
  retorna `{ paymentIntentId, clientSecret, pix: { qrCodeText, qrCodePng, expiresAt } }`
  lendo `next_action.pix_display_qr_code`.
- `refundPayment(paymentIntentId)` para política de 7 dias.

**`src/payment/webhook.controller.ts`**:

- Endpoint `POST /webhooks/stripe` **fora** do `ValidationPipe` global
  (precisa do raw body para validar HMAC).
- Configurar Fastify content-type parser que preserva o buffer raw apenas
  nesta rota (registrar no `main.ts` antes do `setGlobalPrefix`).
- Valida com
  `stripe.webhooks.constructEvent(raw, signatureHeader, STRIPE_WEBHOOK_SECRET)`.
- Idempotência: insere `event.id` em `processed_webhook_events` antes de
  processar; conflito de PK = no-op silencioso (200).
- Trata `payment_intent.succeeded` → ativa `subscription`, promove role a
  `subscriber`, enfileira email de confirmação.
- Trata `payment_intent.payment_failed` / `payment_intent.canceled` → mantém
  status `pending_payment`, opcionalmente recria PI.

**`src/payment/payment.controller.ts`** (substitui o mock-confirm):

- `POST /subscription/payment-intent` cria/recupera PI Pix.
- `GET /subscription/payment-intent/:id/status` para polling do frontend
  (espelha status local; webhook é a fonte da verdade).
- `POST /subscription/refund` valida janela de 7 dias E que
  `competition.locksAt > NOW()`, chama `refundPayment` no Stripe, persiste
  `refundedAt`.

**`src/payment/reconciliation.cron.ts`** com `@nestjs/schedule` — diário às
03:00 BRT, lista `stripe.paymentIntents.list({ created: { gte: hoje-24h } })`,
reconcilia status local com Stripe (catch-net para webhook perdido).

### Ranking + Redis

**`src/redis/redis.module.ts`** — provider único com `ioredis` injetado,
factory lê `REDIS_HOST`/`REDIS_PORT`.

**`src/ranking/ranking.service.ts`**:

- `ranking:general` (ZSET): `ZADD` cada user_id → soma de pontos.
- `ranking:side:{sidePoolId}` (ZSET por bolão paralelo) — invalidado/repopulado
  quando há mudança.
- `stats:exact_scores:{userId}` (counter) para Rei dos Placares.
- `recomputeForMatch(matchId)`: identifica usuários afetados pelo resultado de
  um jogo, soma pontos do `guess_scores`, atualiza ZSETs e counters.
  Idempotente (computa o valor absoluto, não o delta).
- `getGeneralRanking({ limit, userId })`: retorna top N + posição do usuário
  logado.
- `getSidePoolRanking(sidePoolId)`: subset filtrado dos membros usando
  `ZSCORE` para cada membro.

**`src/ranking/ranking.controller.ts`**:

- `GET /general-pool/ranking?limit=100`.
- `GET /side-pools/:id/ranking`.

### Prize Engine + Admin

**`src/prize/prize-engine.ts`** (puro):

- `computeBreakdown(totalSubscribers, currentRanking, exactScoresCounts)`
  retorna `PrizesViewDto` com valores estimados em centavos por categoria,
  com leader atual.
- Truncamento por categoria (`Math.floor`), residual em centavos vai para
  `admin`.
- `finalize(subscriptions, finalRanking, exactScores)` produz array de
  `PrizePayout` resolvendo empates (divisão igualitária + skip de posições
  consumidas).
- Testes: 1000 / 100 / 10 inscritos, empate triplo no 1º (3 ganham 1/3 do
  prêmio_1º; 2º a 4º saltam, próximo prêmio vai pro 4º real), arredondamento
  residual, idempotência da finalização.

**`src/prize/prize.controller.ts`**:

- `GET /general-pool/prizes` retorna PrizesViewDto em tempo real (cacheado em
  Redis com TTL 30s).

**`src/admin/admin.module.ts`** com endpoints protegidos por
`RolesGuard(['admin'])`:

- `PUT /admin/matches/:id/result` (já criado no Sprint 2, agora dispara
  recompute via BullMQ).
- `POST /admin/recompute` força recálculo total de scores+ranking.
- `POST /admin/closure/finalize` chama `prizeEngine.finalize`, persiste
  `prize_payouts`, marca `competition.closure_status = finalized`. One-shot
  idempotente.
- `GET /admin/prizes/payout-report` retorna CSV (Content-Type text/csv) com
  colunas `posicao, user_id, nome, email, valor_brl`.
- `POST /admin/prizes/:userId/mark-paid` registra `paid_at` +
  `paymentReference` + `paidByAdminId`.

### Filas

- `src/queue/queue.module.ts` com `@nestjs/bullmq` + Redis.
- Filas: `score-recompute`, `ranking-invalidate`, `email`.
- Workers como `@Processor()` injetando os engines/serviços. ScoreEngine já
  roda inline no admin.put quando registra resultado; BullMQ entra como camada
  de retry + escala horizontal.

### Frontend

**`src/pages/PaymentPix.tsx`**: tela que mostra QR code + texto copia-e-cola +
timer de expiração (24h Stripe default). Polling em `GET /subscription/status`
a cada 5s até virar `active`. Botão "Já paguei" desativado durante polling.
Reaproveita classes `card-glow`, `btn-gold`.

**`src/pages/Ranking.tsx`**: dropdown para escolher
`Geral | Bolão Paralelo X | Bolão Paralelo Y`. Top 100 com destaque na linha
do usuário logado, contador "Rei dos Placares" em chip dourado. Atualização
via `useQuery` com `refetchInterval: 60_000`.

**`src/pages/Prizes.tsx`**: 7 cards (1º/2º/3º/4º/5º/Rei/Admin) com valor
estimado em BRL e líder atual em cada categoria. Total do pool em destaque.

### Painel Admin + Toggle de visão

Concentrado nesta sprint conforme alinhamento (escopo operacional).

**`src/lib/auth.tsx`** (estende o AuthProvider existente):

- Novo estado `adminView: boolean` persistido em `localStorage` chave
  `bolao.adminView.v1`.
- `effectiveRole` derivado:
  `user.role === 'admin' && adminView ? 'admin' : 'subscriber'`.
- Função `toggleAdminView()` exposta no contexto.

**`src/components/AdminToggle.tsx`**: switch no header com label "Modo admin",
visível **apenas** se `user.role === 'admin'`. Em modo admin, switch fica
dourado; em modo jogador, neutro. Estilo coerente com `chip` + `btn-secondary`.

**`src/components/Layout.tsx`** (modificar): renderizar `<AdminToggle />` no
header só para admins, à direita dos links de navegação, antes do avatar.

**`src/pages/admin/AdminLayout.tsx`**: layout dedicado para `/admin/*` com
sidebar (Resultados / Premiação / Reconciliação). Reaproveita `card-glow`,
paleta dourada predominante para diferenciar visualmente.

**`src/pages/admin/AdminMatches.tsx`**: lista jogos da próxima rodada com
inputs para inserir placar oficial. Botão "Pré-visualizar impacto" → mostra
modal com diff esperado (quantos jogadores ganham pontos, top 5 do ranking
depois) → botão "Confirmar".

**`src/pages/admin/AdminPrizes.tsx`**: tabela de payouts (após finalize),
download do CSV, botão "Marcar como pago" por linha (abre modal pedindo
`paymentReference` opcional).

**`src/pages/admin/AdminClosure.tsx`**: botão grande "Encerrar competição"
(visível apenas após o último jogo ter resultado oficial). Confirmação dupla.

**`src/App.tsx`** (modificar): rotas `/admin/*` protegidas com `AdminRoute`
que valida `user.role === 'admin' && adminView === true`. Se admin desativa o
toggle estando em `/admin/*`, redireciona para `/dashboard`.

### Critérios de aceitação Sprint 3

- Usuário paga R$ 50 via Pix real (sandbox Stripe), webhook ativa inscrição
  em < 10s.
- Webhook é idempotente: re-entrega do mesmo evento = 200, sem dupla ativação.
- Refund manual via API funciona dentro de 7 dias + antes do lock.
- Ranking do Geral retorna em < 100ms (cache hit) com top 100 + posição
  própria.
- Admin (role) vê toggle no header; ao ativar, sidebar admin aparece em
  `/admin/*`; ao desativar, vê app como subscriber comum.
- Admin insere resultado → ranking atualiza em < 30s; PrizesView reflete novo
  líder.
- `POST /admin/closure/finalize` gera `prize_payouts` somando exatamente
  `N × R$ 50` (conservação).

---

## Sprint 4 — Notificações + Polish (Dias 24–28)

Objetivo: experiência completa, observável, testada E2E. Pronto para soft
launch.

### Notificações

**`src/email/drivers/resend-email.driver.ts`** — implementa `IEmailDriver`
chamando Resend SDK. Selecionado via `EMAIL_DRIVER=resend`. Mantém driver
mock para CI.

**Templates** (Resend templates ou HTML strings): boas-vindas, recuperação
senha, pagamento confirmado, palpites travados (gatilho automático às
15:55 BRT de 11/06), você está no top X após rodada, você foi premiado,
instruções de pagamento de prêmio.

**`src/notification/push.service.ts`** + **`push.controller.ts`**:

- Web Push nativo com biblioteca `web-push` + chaves VAPID (gerar 1x, salvar
  em env).
- `POST /push/subscribe` registra subscription do navegador.
- `POST /push/unsubscribe` remove.
- Worker BullMQ envia push para jogadores que optaram quando: jogo do qual
  palpitou começa em 5min; mudou posição no top 10 após rodada.

**`src/notification/consent.controller.ts`** + componente frontend
`PushConsentBanner.tsx` — banner LGPD-compliant pedindo opt-in explícito no
primeiro login pós-paywall.

**`src/scheduler/reminder.cron.ts`** — diário às 16:00 BRT de 10/06 (D-1 do
início), envia email para jogadores sem palpites finais submetidos.

### Polish & hardening

- Rate limiting refinado por endpoint (login: 5/15min/IP, webhook: ilimitado
  mas requer assinatura, mutations gerais: 30/min/user).
- Sentry SDK no `main.ts` (front e back), DSN via env.
- Logs estruturados Pino com `request_id` propagado via header
  `x-request-id`.
- Headers de segurança ajustados (CSP estrito).
- Testes E2E Playwright (`apps/api/test/e2e/` rodando contra Docker Compose):
  - Cadastro → pagamento (Stripe test card) → submissão de palpites → admin
    registra resultado → verificação de pontuação no ranking.
  - Admin promovido via SQL no setup do teste → toggle de visão → operação
    completa.

### Critérios de aceitação Sprint 4

- 7 templates de email enviados pelo driver real.
- Push notification recebido no browser após opt-in.
- 1 cenário E2E completo passando em CI.
- Sentry recebe exceções de teste injetadas.
- Latência p95 dos endpoints de leitura < 300ms em teste de carga k6
  (500 req/s).

---

## Padrões a reusar (já existentes no codebase)

- **Design system**: classes `card`, `card-glow`, `btn-primary`, `btn-gold`,
  `btn-secondary`, `input`, `chip`, `label`, `link-accent`, `text-shimmer`,
  `font-display`. Cores `brand-*`, `gold-*`, `midnight-*`, `pitch-*` no
  `apps/web/tailwind.config.js`. **Não criar** classes paralelas — toda tela
  nova reusa o que está em `apps/web/src/index.css`.
- **AuthProvider** (`apps/web/src/lib/auth.tsx`): estender para incluir
  `adminView` + `effectiveRole` + `toggleAdminView`. **Não criar** segundo
  provider.
- **API client** (`apps/web/src/lib/api.ts`): `ApiError`, `setOnAuthLost` já
  tratam 401. Reusar em todas as novas mutations.
- **ActiveSubscriptionGuard**
  (`apps/api/src/auth/guards/active-subscription.guard.ts`): proteger todos os
  novos endpoints player-facing.
- **RolesGuard** (`apps/api/src/auth/guards/roles.guard.ts`) +
  **`@Roles('admin')`**: proteger todos os endpoints admin.
- **PrismaService**: já é global, injeta diretamente.
- **EmailService**: já tem driver abstraction — Sprint 4 só implementa
  `ResendEmailDriver` adicional.
- **@bolao/shared**: adicionar novos DTOs (`GuessDto`, `RankingRowDto`,
  `BracketPreviewDto`, etc.) no mesmo padrão dos existentes. **Rebuildar** o
  pacote shared antes do dev do api (turbo já cuida via
  `dependsOn: ^build`).

## Variáveis de ambiente novas

Acrescentar em `.env.example`:

```
STRIPE_DRIVER=stripe              # mock | stripe
STRIPE_SECRET_KEY=sk_test_...
STRIPE_PUBLISHABLE_KEY=pk_test_...  # exposta no front se necessário
STRIPE_WEBHOOK_SECRET=whsec_...
RESEND_API_KEY=re_...
VAPID_PUBLIC_KEY=...
VAPID_PRIVATE_KEY=...
VAPID_SUBJECT=mailto:admin@bolao.app
SENTRY_DSN=...
```

Limpar duplicatas existentes (`STRIPE_PRIVATE_KEY` deve virar
`STRIPE_SECRET_KEY`).

## Migrations Prisma necessárias

1. Sprint 2: nenhuma (o schema atual já cobre `guesses` +
   `bracket_predictions`).
2. Sprint 3: adicionar `processed_webhook_events` (já no schema, gerar
   migration se ainda não rodou); adicionar `refunded_amount_cents` /
   `stripe_refund_id` se ainda não persistidos.
3. Sprint 4: tabela
   `push_subscriptions(id, user_id, endpoint, keys_p256dh, keys_auth, created_at)`
   para Web Push.

Comando:
`pnpm --filter @bolao/api prisma migrate dev --name <nome>` no início de cada
sprint.

---

## Verificação

### Fluxo completo de aceitação (após Sprint 4)

```bash
# 1. Subir infra + seed
pnpm docker:up
pnpm --filter @bolao/api prisma migrate deploy
pnpm db:seed
pnpm dev

# 2. Smoke E2E manual (ordem)
#   a. Registrar conta → login automático
#   b. POST /subscription/payment-intent → paga com Pix sandbox Stripe
#   c. Webhook ativa subscription → role vira subscriber
#   d. Submeter 72 palpites → ver bracket preview com 32 jogos
#   e. Criar bolão paralelo → copiar link → entrar com outra conta paga
#   f. Promover user para admin via SQL:
#      UPDATE users SET role='admin' WHERE email='admin@test.com';
#   g. Logar como admin → toggle "Modo admin" no header → /admin/matches
#   h. Inserir resultado do primeiro jogo (preview + confirm)
#   i. Verificar GET /general-pool/ranking + GET /general-pool/prizes refletem
#   j. Toggle volta para "Modo jogador" → admin vê app normal
#   k. Admin /admin/closure/finalize após último jogo (em teste, simular com
#      cron acelerado)
#   l. Download CSV de payouts → "Marcar como pago" de uma linha
```

### Testes automatizados

```bash
pnpm test               # unit + integração (Jest + Testcontainers)
pnpm --filter @bolao/api test:e2e   # Playwright (após Sprint 4)
pnpm typecheck
pnpm lint
```

### Métricas mínimas pré-launch (11/06)

- 0 erros no Sentry nas últimas 48h de staging.
- Webhook Stripe: taxa de sucesso > 99% em teste de carga (100 PIs
  disparados).
- Engines: cobertura unitária total ≥ 85%.
- Smoke E2E completo passando em CI.
- Backup automático Postgres verificado (restaurar para staging e validar).

## Riscos imediatos

- **Webhook Stripe + Fastify raw body**: o parser global do Fastify destrói o
  buffer antes do controller — exige content-type parser específico por rota;
  testar early no Sprint 3.
- **BracketEngine + tie-break "fair play"**: critério não simulável. Solução:
  usar rank FIFA como tie-break final marcado como `aux` — documentar e
  validar com PO antes do deploy.
- **Race entre webhook concorrente e reconciliação cron**: ambas tentam
  ativar a mesma subscription — proteger com unique constraint em
  `stripe_payment_intent_id` (já existe) e `INSERT ... ON CONFLICT DO NOTHING`
  para `processed_webhook_events`.
- **Toggle admin↔jogador**: garantir que admin NÃO ganha acesso a dados de
  outros jogadores quando em modo jogador (mesmo backend, mesmo JWT — só o
  frontend muda a UI). Endpoints admin sempre exigem `role === admin` no JWT,
  independente do toggle do frontend.
