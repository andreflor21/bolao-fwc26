# Setup Stripe Checkout — dev e produção

Documenta o setup ponta-a-ponta do **Stripe Checkout** (página hospedada
pela Stripe). Suporta **Cartão / Apple Pay / Boleto / Link** out-of-the-box
sem UI de pagamento custom no nosso lado. Pix está previsto pra quando a
sua conta liberar (60 dias após KYC BR).

## Pré-requisitos

- **Conta Stripe brasileira** (registrada com CNPJ ativo).
- Métodos habilitados em **Settings → Payments → Payment methods**:
  Cartões, Apple Pay, Boleto e/ou Link. Cada um pode ser ativado
  individualmente.
- Node.js + a API local rodando em `localhost:3001`.

## 1. Quais métodos ligar

A Stripe ativa métodos por conta. Pra ver/ligar:

1. Acesse https://dashboard.stripe.com (use o toggle "View test data" pra
   modo test).
2. Vá em **Settings → Payments → Payment methods**.
3. Confirme `Active` em: **Card**, **Apple Pay**, **Boleto**, **Link**.
4. **Pix** estará bloqueado por 60 dias após o KYC. Quando liberar, basta
   adicionar `pix` em `STRIPE_CHECKOUT_METHODS` no `.env` — o código já
   suporta.

> 💡 **Apple Pay funciona automaticamente** com `card` habilitado e
> dispositivos Safari/iOS compatíveis. Não precisa ativar separadamente
> no `STRIPE_CHECKOUT_METHODS`.

## 2. Pegar as test keys

1. Em test mode, **Developers → API keys**.
2. Copie **Publishable key** (`pk_test_...`) → `STRIPE_PUBLISHABLE_KEY`.
3. Reveal + copie **Secret key** (`sk_test_...`) → `STRIPE_SECRET_KEY`.

## 3. Instalar o Stripe CLI

```bash
# macOS
brew install stripe/stripe-cli/stripe

# outros: https://docs.stripe.com/stripe-cli
```

## 4. Login

```bash
stripe login
```

## 5. Forwardar os webhooks

Em um terminal dedicado (deixa rodando):

```bash
stripe listen --forward-to localhost:3001/api/v1/webhooks/stripe
```

Saída traz:

```
Ready! Your webhook signing secret is whsec_abc...xyz (^C to quit)
```

**Cole o `whsec_...` em `STRIPE_WEBHOOK_SECRET`** no `apps/api/.env`.
O secret é por sessão do `stripe listen` — se matar o processo, o secret
muda; atualize o `.env` e reinicie a API.

> 💡 **Filtrar eventos** (reduz ruído no log):
>
> ```bash
> stripe listen \
>   --events checkout.session.completed,payment_intent.succeeded,payment_intent.payment_failed,payment_intent.canceled,charge.refunded \
>   --forward-to localhost:3001/api/v1/webhooks/stripe
> ```

## 6. Variáveis de ambiente

```env
STRIPE_DRIVER=stripe
STRIPE_SECRET_KEY=sk_test_...
STRIPE_PUBLISHABLE_KEY=pk_test_...
STRIPE_WEBHOOK_SECRET=whsec_...
STRIPE_CHECKOUT_METHODS=card,link,boleto    # Pix → adicione quando liberar
STRIPE_BOLETO_EXPIRES_AFTER_DAYS=3
WEB_ORIGIN=http://localhost:5173             # success/cancel URLs partem daqui
```

## 7. Reiniciar a API

```bash
pnpm --filter @bolao/api dev
```

Confirme no log:

```
[Nest] [PaymentModule]  Using real Stripe payment driver
[Nest] [PaymentService] Checkout methods: card, link, boleto
```

## 8. Testar o fluxo end-to-end

1. Login na web (usuário sem subscription ativa).
2. Clica em "Inscrever-se" → vai pra `/pay`.
3. Clica **Pagar agora — R$ 50,00** → redireciona pra `checkout.stripe.com`.
4. Use cartão de teste BR: `4000 0000 0000 0010` (qualquer CVC/data futura)
   ou Boleto / Link.
5. Stripe redireciona de volta pra `/pay/success?sid=cs_...`.
6. SPA faz polling em `/subscription/payment-status` — quando o webhook
   chega, status flipa pra `active` e redireciona pro dashboard.

### Cartões de teste úteis

| Número                  | Comportamento                                    |
|-------------------------|--------------------------------------------------|
| `4242 4242 4242 4242`   | Aprovado, sem 3DS                                |
| `4000 0027 6000 3184`   | Requer 3DS (modal Stripe)                        |
| `4000 0000 0000 9995`   | Decline (insufficient funds) — pra testar erros  |

### Testar Boleto

No checkout, escolha "Boleto" → PDF é gerado. Em test mode, pra simular
pagamento, vá no **Dashboard → Payments → seu PI** → "Send test payment".

### Testar via CLI

```bash
# Dispara checkout.session.completed pra uma session sintética (não vincula
# ao seu user, só pra ver o webhook chegar):
stripe trigger checkout.session.completed
```

## 9. Eventos tratados pelo webhook

| Event type                       | Ação                                                          |
|----------------------------------|---------------------------------------------------------------|
| `checkout.session.completed`     | Persiste `payment_intent`, ativa subscription (instantâneo: card/Link/Apple Pay) |
| `payment_intent.succeeded`       | Backup pra boleto/pix (chega depois da session.completed)     |
| `payment_intent.payment_failed`  | Log (sem mudar estado — admin/UX decide retry)                |
| `payment_intent.canceled`        | Log de cancelamento                                           |
| `charge.refunded`                | Marca subscription `refunded` + role volta pra `player`       |

Todo evento é registrado em `processed_webhook_events` antes do handler
rodar — idempotência automática contra entregas duplicadas.

## 10. Setup em produção

1. **Developers → Webhooks → Add endpoint**.
2. URL: `https://api.seu-dominio.com/api/v1/webhooks/stripe`
3. Eventos: `checkout.session.completed`, `payment_intent.succeeded`,
   `payment_intent.payment_failed`, `payment_intent.canceled`, `charge.refunded`.
4. Copie o **Signing secret** (`whsec_...`) → `STRIPE_WEBHOOK_SECRET` em prod.
5. Use **live keys** (`sk_live_*`, `pk_live_*`) depois que sair do test mode.
6. `NODE_ENV=production` — o `PaymentModule` refusa subir com
   `STRIPE_DRIVER=mock` em produção.

## 11. Adicionar Pix quando liberar

Quando seu KYC liberar Pix (~60 dias após cadastro BR):

1. Confirme Pix `Active` em **Settings → Payments → Methods**.
2. Atualize `.env`:
   ```env
   STRIPE_CHECKOUT_METHODS=card,link,boleto,pix
   ```
3. Restart a API. Stripe Checkout passa a exibir Pix como opção
   automaticamente — zero código novo.

## 12. Reconciliation

Se um webhook for perdido (rede ruim, downtime), o
[`ReconciliationCron`](../apps/api/src/payment/reconciliation.cron.ts) varre
PIs recentes a cada dia (03:00 BRT) via `stripe.paymentIntents.list`,
encontra os que estão `succeeded` mas têm subscription `pending_payment`
no DB, e dispara `activateFromPaymentIntent` localmente.

Pra forçar manualmente: `POST /admin/recompute`.

## 13. Troubleshooting

| Sintoma                                            | Provável causa                                                                 |
|----------------------------------------------------|--------------------------------------------------------------------------------|
| `Webhook signature verification failed`             | `STRIPE_WEBHOOK_SECRET` desatualizado após restart do `stripe listen`.          |
| Botão "Pagar agora" não faz nada                    | Bloqueador de popup ou erro na sessão. Veja o console; mensagem virá do API.    |
| Página `/pay/success` fica em "Processando"         | Webhook não chegou. Confirme `stripe listen` rodando; veja `processed_webhook_events`. |
| `Refusing to start with STRIPE_DRIVER='mock'`       | Você setou `NODE_ENV=production` mas esqueceu de mudar `STRIPE_DRIVER=stripe`. |
| Boleto não aparece como opção                       | Não habilitado em test mode. Vá em Settings → Payments → Methods → Boleto.      |
| Logs com `[Stripe.checkout.sessions.create] ...`    | Wrapper de erro. Procure o `req=req_...` no dashboard Stripe → Developers → Logs. |
