import { useEffect, useState } from 'react';
import { useMutation } from '@tanstack/react-query';
import { Link, useNavigate } from 'react-router-dom';
import { api, ApiError } from '../lib/api';

interface CreateSessionResponse {
  sessionId: string;
  checkoutUrl: string;
  expiresAt: string;
  amountCents: number;
  baseAmountCents: number;
  surchargeCents: number;
  subscriptionStatus: 'pending_payment' | 'active' | 'refunded';
  methods: Array<'card' | 'link' | 'boleto' | 'pix' | 'apple_pay'>;
  pixFallbackEnabled: boolean;
}

const METHOD_LABEL: Record<string, string> = {
  card: '💳 Cartão',
  link: '🔗 Link',
  boleto: '🧾 Boleto',
  pix: '📱 Pix',
  apple_pay: ' Apple Pay',
};

function formatBRL(cents: number): string {
  return (cents / 100).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
}

export function Payment() {
  const navigate = useNavigate();
  const [error, setError] = useState<string | null>(null);

  const createSession = useMutation({
    mutationFn: () =>
      api<CreateSessionResponse>('/subscription/checkout-session', { method: 'POST' }),
    onSuccess: (data) => {
      // Stripe-hosted checkout (or our mock-success page in dev).
      window.location.href = data.checkoutUrl;
    },
    onError: (e: unknown) => {
      if (e instanceof ApiError && e.status === 409) {
        navigate('/dashboard');
        return;
      }
      setError(e instanceof Error ? e.message : 'Falha ao iniciar pagamento');
    },
  });

  // Pre-fetch the methods so we can show what'll be available before the
  // user clicks "Pagar agora". A second click on /checkout-session reuses
  // the same session (idempotent), so no waste.
  const [methods, setMethods] = useState<CreateSessionResponse['methods']>([]);
  const [amountCents, setAmountCents] = useState<number | null>(null);
  const [baseAmountCents, setBaseAmountCents] = useState<number | null>(null);
  const [surchargeCents, setSurchargeCents] = useState(0);
  const [pixFallback, setPixFallback] = useState(false);
  useEffect(() => {
    let cancelled = false;
    api<CreateSessionResponse>('/subscription/checkout-session', { method: 'POST' })
      .then((data) => {
        if (cancelled) return;
        setMethods(data.methods);
        setAmountCents(data.amountCents);
        setBaseAmountCents(data.baseAmountCents);
        setSurchargeCents(data.surchargeCents);
        setPixFallback(data.pixFallbackEnabled);
      })
      .catch((e: unknown) => {
        if (e instanceof ApiError && e.status === 409) {
          navigate('/dashboard');
          return;
        }
        // Defer error display until user actually clicks pay.
      });
    return () => {
      cancelled = true;
    };
  }, [navigate]);

  return (
    <div className="space-y-8 max-w-2xl mx-auto">
      <header>
        <p className="text-xs font-bold tracking-[0.4em] text-gold-400">INSCRIÇÃO</p>
        <h1 className="font-display text-4xl tracking-wider text-white mt-1">
          <span className="text-shimmer">PAGAMENTO</span>
        </h1>
        <p className="text-sm text-emerald-200/70 mt-2">
          {baseAmountCents
            ? `Pague ${formatBRL(baseAmountCents)}${surchargeCents > 0 ? ' + taxa de processamento' : ''} para ativar sua inscrição. Você será levado ao checkout seguro da Stripe.`
            : 'Carregando opções de pagamento...'}
        </p>
      </header>

      {error && (
        <div className="card text-red-200 border-red-400/40 bg-red-500/10">
          <div className="flex items-center justify-between gap-3">
            <p className="text-sm">{error}</p>
            <button
              onClick={() => setError(null)}
              className="text-xs text-red-100/70 hover:text-red-100"
            >
              fechar
            </button>
          </div>
        </div>
      )}

      <section className="card-glow space-y-5">
        <div>
          <p className="text-xs text-emerald-300/70 tracking-wider uppercase mb-2">
            Métodos disponíveis
          </p>
          {methods.length === 0 ? (
            <p className="text-sm text-emerald-200/60">—</p>
          ) : (
            <ul className="flex flex-wrap gap-2">
              {methods.map((m) => (
                <li key={m} className="chip">
                  {METHOD_LABEL[m] ?? m}
                </li>
              ))}
              {methods.includes('card') && !methods.includes('apple_pay') && (
                <li className="chip">Apple Pay (auto)</li>
              )}
            </ul>
          )}
        </div>

        <div className="border-t border-emerald-500/15 pt-4">
          <button
            className="btn-gold text-base px-6 py-3 w-full sm:w-auto"
            disabled={createSession.isPending || !amountCents}
            onClick={() => createSession.mutate()}
          >
            {createSession.isPending
              ? 'Abrindo checkout...'
              : `💳 Pagar agora${baseAmountCents ? ` — ${formatBRL(baseAmountCents)}${surchargeCents > 0 ? ' + taxa' : ''}` : ''}`}
          </button>
          {surchargeCents > 0 && amountCents && baseAmountCents && (
            <p className="text-[11px] text-emerald-200/60 mt-2">
              Total no checkout: <strong>{formatBRL(amountCents)}</strong> ({formatBRL(baseAmountCents)} de inscrição + {formatBRL(surchargeCents)} de taxa de processamento).
            </p>
          )}
          <p className="text-[11px] text-emerald-200/50 mt-2">
            Você será redirecionado para a página segura da Stripe. Após confirmar o
            pagamento, voltará automaticamente para o app.
          </p>
        </div>

        {pixFallback && (
          <div className="border-t border-emerald-500/15 pt-4">
            <p className="text-xs text-emerald-300/70 tracking-wider uppercase mb-2">
              Ou pague com Pix
            </p>
            <Link
              to="/pay/pix"
              className="inline-flex items-center gap-2 text-sm text-emerald-100 border border-emerald-500/30 hover:border-emerald-400/60 rounded-md px-4 py-2 transition"
            >
              📱 Pagar com Pix (QR Code + comprovante)
            </Link>
            <p className="text-[11px] text-emerald-200/50 mt-2">
              Anexe o comprovante e confirmamos sua inscrição automaticamente.
            </p>
          </div>
        )}
      </section>

      <p className="text-xs text-emerald-200/60 text-center">
        Boleto pode levar 1-2 dias úteis para confirmar. Cartão, Apple Pay e Link
        são instantâneos.
      </p>
    </div>
  );
}
