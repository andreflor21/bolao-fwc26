import { useEffect, useMemo, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useNavigate } from 'react-router-dom';
import { api, ApiError } from '../lib/api';

interface CreatePIResponse {
  paymentIntentId: string;
  qrCodeText: string;
  qrCodePngUrl: string;
  expiresAt: string;
  amountCents: number;
  subscriptionStatus: 'pending_payment' | 'active' | 'refunded';
}

interface PIStatusResponse {
  paymentIntentId: string;
  paymentIntentStatus: string | null;
  subscriptionStatus: 'pending_payment' | 'active' | 'refunded';
  paidAt: string | null;
}

function formatBRL(cents: number): string {
  return (cents / 100).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
}

function useCountdown(targetIso: string | undefined): string {
  const [now, setNow] = useState(Date.now());
  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), 1_000);
    return () => clearInterval(id);
  }, []);
  if (!targetIso) return '—';
  const diff = new Date(targetIso).getTime() - now;
  if (diff <= 0) return 'expirado';
  const h = Math.floor(diff / 3_600_000);
  const m = Math.floor((diff % 3_600_000) / 60_000);
  const s = Math.floor((diff % 60_000) / 1_000);
  return h > 0 ? `${h}h ${m}m ${s}s` : `${m}m ${s.toString().padStart(2, '0')}s`;
}

export function PaymentPix() {
  const navigate = useNavigate();
  const qc = useQueryClient();
  const [error, setError] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);

  const createPI = useMutation({
    mutationFn: () =>
      api<CreatePIResponse>('/subscription/payment-intent', { method: 'POST' }),
    onError: (e: unknown) => {
      if (e instanceof ApiError && e.status === 409) {
        // ALREADY_ACTIVE — go to dashboard.
        navigate('/dashboard');
        return;
      }
      setError(e instanceof Error ? e.message : 'Falha ao gerar Pix');
    },
  });

  useEffect(() => {
    if (!createPI.data && !createPI.isPending) {
      createPI.mutate();
    }
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const pi = createPI.data;

  const statusQuery = useQuery({
    queryKey: ['pi-status', pi?.paymentIntentId],
    queryFn: () =>
      api<PIStatusResponse>(`/subscription/payment-intent/${pi!.paymentIntentId}/status`),
    enabled: Boolean(pi?.paymentIntentId),
    refetchInterval: (q) =>
      q.state.data?.subscriptionStatus === 'active' ? false : 5_000,
  });

  useEffect(() => {
    if (statusQuery.data?.subscriptionStatus === 'active') {
      qc.invalidateQueries({ queryKey: ['subscription-status'] });
      const id = setTimeout(() => navigate('/dashboard'), 1_200);
      return () => clearTimeout(id);
    }
  }, [statusQuery.data?.subscriptionStatus, navigate, qc]);

  const mockMutation = useMutation({
    mutationFn: () => api('/subscription/mock-confirm', { method: 'POST' }),
    onSuccess: () => {
      statusQuery.refetch();
    },
    onError: (e: unknown) => {
      setError(e instanceof Error ? e.message : 'mock-confirm falhou');
    },
  });

  const expiresIn = useCountdown(pi?.expiresAt);
  const isActive = statusQuery.data?.subscriptionStatus === 'active';
  const isMock = useMemo(
    () => pi?.paymentIntentId?.startsWith('mock_pi_') ?? false,
    [pi?.paymentIntentId],
  );

  async function copyCode() {
    if (!pi?.qrCodeText) return;
    await navigator.clipboard.writeText(pi.qrCodeText);
    setCopied(true);
    setTimeout(() => setCopied(false), 1_600);
  }

  return (
    <div className="space-y-8 max-w-2xl mx-auto">
      <header>
        <p className="text-xs font-bold tracking-[0.4em] text-gold-400">PAGAMENTO</p>
        <h1 className="font-display text-4xl tracking-wider text-white mt-1">
          <span className="text-shimmer">PIX · BOLÃO GERAL</span>
        </h1>
        <p className="text-sm text-emerald-200/70 mt-2">
          {pi
            ? `Pague ${formatBRL(pi.amountCents)} para ativar sua inscrição. A confirmação chega em segundos via webhook.`
            : 'Gerando QR code...'}
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

      {isActive && (
        <div className="card-glow border-emerald-400/40 bg-emerald-500/10 text-emerald-100">
          <p className="font-semibold">✅ Pagamento confirmado!</p>
          <p className="text-sm text-emerald-100/80 mt-1">
            Redirecionando para o dashboard...
          </p>
        </div>
      )}

      {!isActive && pi && (
        <section className="card-glow space-y-5">
          <div className="grid sm:grid-cols-[200px,1fr] gap-5 items-start">
            <div className="rounded-xl bg-white p-3 grid place-items-center w-full aspect-square">
              {pi.qrCodePngUrl.startsWith('data:image') ? (
                <img
                  src={pi.qrCodePngUrl}
                  alt="QR Code Pix (mock)"
                  className="w-full h-full object-contain opacity-30"
                />
              ) : (
                <img
                  src={pi.qrCodePngUrl}
                  alt="QR Code Pix"
                  className="w-full h-full object-contain"
                />
              )}
            </div>
            <div className="space-y-3">
              <div>
                <p className="label">Copia e cola Pix</p>
                <textarea
                  readOnly
                  value={pi.qrCodeText}
                  rows={4}
                  className="input mt-1 font-mono text-[11px] resize-none"
                  onFocus={(e) => e.currentTarget.select()}
                />
                <button onClick={copyCode} className="btn-secondary text-xs mt-2">
                  {copied ? '✓ Copiado!' : 'Copiar código'}
                </button>
              </div>
              <div className="text-xs text-emerald-200/70">
                <p>
                  Expira em <span className="text-gold-300 font-semibold">{expiresIn}</span>
                </p>
                <p className="mt-1">
                  Status:{' '}
                  <span className="text-emerald-100">
                    {statusQuery.data?.paymentIntentStatus ?? 'aguardando'}
                  </span>
                  {statusQuery.isFetching && ' · verificando…'}
                </p>
              </div>
            </div>
          </div>

          <p className="text-xs text-emerald-200/60 border-t border-emerald-500/15 pt-3">
            Aponte a câmera do seu app bancário para o QR ou cole o código no campo de Pix copia-e-cola.
            Esta tela atualiza sozinha quando o pagamento for confirmado.
          </p>

          {isMock && (
            <div className="rounded-xl border border-amber-400/30 bg-amber-500/10 p-3 text-amber-100 text-xs">
              <p className="font-semibold mb-1">🛠️ Driver mock ativo (dev)</p>
              <p>
                O Pix acima é falso. Use o botão abaixo para simular a confirmação como se o webhook
                Stripe tivesse chegado.
              </p>
              <button
                disabled={mockMutation.isPending}
                onClick={() => mockMutation.mutate()}
                className="btn-secondary text-xs mt-2"
              >
                {mockMutation.isPending ? 'Confirmando...' : 'Simular pagamento confirmado'}
              </button>
            </div>
          )}
        </section>
      )}

      {createPI.isPending && !pi && (
        <p className="text-emerald-200/70 text-sm">Gerando QR code...</p>
      )}
    </div>
  );
}
