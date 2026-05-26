import { useEffect } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { api, ApiError } from '../lib/api';

interface StatusResponse {
  sessionId: string | null;
  paymentIntentId: string | null;
  paymentIntentStatus: string | null;
  checkoutSessionStatus: 'open' | 'complete' | 'expired' | null;
  subscriptionStatus: 'pending_payment' | 'active' | 'refunded';
  paidAt: string | null;
}

/**
 * Lands here after Stripe Checkout returns success. The URL carries the
 * Stripe-substituted session ID via `?sid=<id>`. We poll our own API for
 * the subscription status — when the webhook lands, status flips to
 * `active` and we redirect to the dashboard.
 *
 * If the browser arrives faster than the webhook (typical for card/Apple
 * Pay), polling smoothly bridges the gap. For boleto, we land in
 * `processing` and tell the user to wait for the email confirmation.
 */
export function PaymentSuccess() {
  const navigate = useNavigate();
  const qc = useQueryClient();
  const [params] = useSearchParams();
  const sid = params.get('sid');
  const isMockSession = sid?.startsWith('mock_cs_') ?? false;

  const statusQuery = useQuery({
    queryKey: ['payment-status', sid],
    queryFn: () =>
      api<StatusResponse>(
        sid
          ? `/subscription/payment-status?sid=${encodeURIComponent(sid)}`
          : '/subscription/payment-status',
      ),
    refetchInterval: (q) =>
      q.state.data?.subscriptionStatus === 'active' ? false : 3_000,
  });

  // Dev mode: if this is a mock session, fire the confirmation automatically
  // so the polling loop sees `active` without a real webhook.
  const mockConfirm = useMutation({
    mutationFn: () => api(`/subscription/mock-confirm/${sid}`, { method: 'POST' }),
    onSuccess: () => statusQuery.refetch(),
  });
  useEffect(() => {
    if (isMockSession && !mockConfirm.isSuccess && !mockConfirm.isPending) {
      mockConfirm.mutate();
    }
  }, [isMockSession, mockConfirm]);

  useEffect(() => {
    if (statusQuery.data?.subscriptionStatus === 'active') {
      qc.invalidateQueries({ queryKey: ['subscription-status'] });
      const id = setTimeout(() => navigate('/dashboard'), 1_500);
      return () => clearTimeout(id);
    }
  }, [statusQuery.data?.subscriptionStatus, navigate, qc]);

  const isActive = statusQuery.data?.subscriptionStatus === 'active';
  const piStatus = statusQuery.data?.paymentIntentStatus;

  return (
    <div className="space-y-6 max-w-xl mx-auto">
      {isActive ? (
        <div className="card-glow text-center border-emerald-400/40 bg-emerald-500/10">
          <p className="text-5xl mb-2">✅</p>
          <h1 className="font-display text-3xl tracking-wider text-white">
            <span className="text-shimmer">PAGAMENTO CONFIRMADO</span>
          </h1>
          <p className="text-sm text-emerald-100/85 mt-2">
            Sua inscrição está ativa. Redirecionando para o dashboard...
          </p>
        </div>
      ) : (
        <div className="card-glow space-y-3">
          <h1 className="font-display text-2xl tracking-wider text-white">
            <span className="text-shimmer">PROCESSANDO PAGAMENTO</span>
          </h1>
          <p className="text-sm text-emerald-100/80">
            Recebemos seu pagamento e estamos aguardando a confirmação da operadora.
            {piStatus === 'processing' &&
              ' Boleto e pagamentos assíncronos podem levar 1-2 dias úteis.'}
          </p>
          {statusQuery.error instanceof ApiError && statusQuery.error.status !== 404 && (
            <p className="text-xs text-red-200">
              {statusQuery.error.message}
            </p>
          )}
          <div className="flex items-center gap-2 text-xs text-emerald-200/70">
            <span className="inline-block w-2 h-2 rounded-full bg-emerald-400 animate-pulse" />
            Verificando a cada 3s — esta página atualiza sozinha.
          </div>
          <div className="pt-2">
            <Link to="/dashboard" className="link-accent text-sm">
              Voltar ao dashboard (status fica salvo)
            </Link>
          </div>
        </div>
      )}
    </div>
  );
}
