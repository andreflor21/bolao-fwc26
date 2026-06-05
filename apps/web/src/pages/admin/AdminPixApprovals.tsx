import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { api, ApiError } from '../../lib/api';
import { AdminPageHeader } from '../../components/admin/AdminPageHeader';

interface PendingPixItem {
  subscriptionId: string;
  userId: string;
  userName: string;
  userEmail: string;
  amountCents: number;
  receiptStatus: 'analyzing' | 'manual_review' | 'rejected' | 'auto_confirmed' | 'none';
  uploadedAt: string | null;
  notes: string | null;
  verdict: unknown;
  hasReceiptImage: boolean;
}

const STATUS_LABEL: Record<PendingPixItem['receiptStatus'], string> = {
  none: 'Sem comprovante',
  analyzing: 'Analisando',
  manual_review: 'Revisão manual',
  rejected: 'Recusado pela IA',
  auto_confirmed: 'Confirmado',
};

function brl(cents: number): string {
  return (cents / 100).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
}

export function AdminPixApprovals() {
  const qc = useQueryClient();
  const [error, setError] = useState<string | null>(null);
  const [openReceipt, setOpenReceipt] = useState<string | null>(null);

  const pendingQuery = useQuery({
    queryKey: ['admin-pix-pending'],
    queryFn: () => api<PendingPixItem[]>('/admin/pix/pending'),
    refetchInterval: 30_000,
  });

  const approveMutation = useMutation({
    mutationFn: (id: string) =>
      api<{ activated: boolean; reason?: string }>(`/admin/pix/${id}/approve`, { method: 'POST' }),
    onSuccess: (data) => {
      if (!data.activated) {
        setError(`Não ativou: ${data.reason ?? 'motivo desconhecido'}`);
      } else {
        setError(null);
      }
      qc.invalidateQueries({ queryKey: ['admin-pix-pending'] });
    },
    onError: (e: unknown) => {
      setError(e instanceof ApiError ? e.message : 'Falha ao aprovar');
    },
  });

  const rejectMutation = useMutation({
    mutationFn: (id: string) =>
      api<{ rejected: boolean }>(`/admin/pix/${id}/reject`, { method: 'POST', body: '{}' }),
    onSuccess: () => {
      setError(null);
      qc.invalidateQueries({ queryKey: ['admin-pix-pending'] });
    },
    onError: (e: unknown) => {
      setError(e instanceof ApiError ? e.message : 'Falha ao recusar');
    },
  });

  const items = pendingQuery.data ?? [];

  return (
    <div className="space-y-6">
      <AdminPageHeader
        title="APROVAÇÃO MANUAL"
        subtitle="Inscrições pagas via Pix que não foram confirmadas automaticamente. Veja o comprovante enviado e ative a inscrição manualmente após conferir o pagamento na sua conta."
      />

      {error && (
        <p className="text-sm text-red-200 bg-red-500/10 border border-red-400/30 rounded-xl p-3">
          {error}
        </p>
      )}

      {pendingQuery.isLoading ? (
        <p className="text-emerald-200/70">Carregando...</p>
      ) : items.length === 0 ? (
        <div className="card-glow">
          <p className="text-emerald-100/80">Nenhuma inscrição Pix aguardando aprovação. 🎉</p>
        </div>
      ) : (
        <div className="space-y-4">
          {items.map((item) => {
            const busy =
              (approveMutation.isPending && approveMutation.variables === item.subscriptionId) ||
              (rejectMutation.isPending && rejectMutation.variables === item.subscriptionId);
            const showReceipt = openReceipt === item.subscriptionId;
            return (
              <section key={item.subscriptionId} className="card space-y-3">
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div className="min-w-0">
                    <p className="font-semibold text-emerald-50">{item.userName}</p>
                    <p className="text-xs text-emerald-200/60 break-all">{item.userEmail}</p>
                  </div>
                  <div className="text-right shrink-0">
                    <p className="font-display text-xl text-gold-200">{brl(item.amountCents)}</p>
                    <span className="text-[11px] uppercase tracking-wider text-emerald-300/60">
                      {STATUS_LABEL[item.receiptStatus] ?? item.receiptStatus}
                    </span>
                  </div>
                </div>

                {item.notes && (
                  <p className="text-xs text-emerald-200/70 border-l-2 border-emerald-500/30 pl-3">
                    {item.notes}
                  </p>
                )}
                {item.uploadedAt && (
                  <p className="text-[11px] text-emerald-300/50">
                    Enviado em{' '}
                    {new Date(item.uploadedAt).toLocaleString('pt-BR', {
                      dateStyle: 'short',
                      timeStyle: 'short',
                    })}
                  </p>
                )}

                {item.hasReceiptImage ? (
                  <div>
                    <button
                      className="btn-ghost text-xs"
                      onClick={() =>
                        setOpenReceipt(showReceipt ? null : item.subscriptionId)
                      }
                    >
                      {showReceipt ? 'Ocultar comprovante' : '🔍 Ver comprovante'}
                    </button>
                    {showReceipt && <ReceiptViewer subscriptionId={item.subscriptionId} />}
                  </div>
                ) : (
                  <p className="text-xs text-emerald-300/50">Sem imagem do comprovante salva.</p>
                )}

                <div className="flex justify-end gap-2 pt-1">
                  <button
                    className="btn-ghost text-sm"
                    disabled={busy}
                    onClick={() => rejectMutation.mutate(item.subscriptionId)}
                  >
                    Recusar
                  </button>
                  <button
                    className="btn-gold text-sm"
                    disabled={busy}
                    onClick={() => approveMutation.mutate(item.subscriptionId)}
                  >
                    {busy ? 'Processando...' : '✓ Aprovar inscrição'}
                  </button>
                </div>
              </section>
            );
          })}
        </div>
      )}
    </div>
  );
}

function ReceiptViewer({ subscriptionId }: { subscriptionId: string }) {
  const receiptQuery = useQuery({
    queryKey: ['admin-pix-receipt', subscriptionId],
    queryFn: () => api<{ dataUrl: string }>(`/admin/pix/${subscriptionId}/receipt`),
    staleTime: 5 * 60_000,
  });

  if (receiptQuery.isLoading) {
    return <p className="text-xs text-emerald-200/60 mt-3">Carregando comprovante...</p>;
  }
  if (receiptQuery.error || !receiptQuery.data) {
    return <p className="text-xs text-red-200 mt-3">Falha ao carregar o comprovante.</p>;
  }
  return (
    <a
      href={receiptQuery.data.dataUrl}
      target="_blank"
      rel="noreferrer"
      className="mt-3 block"
      title="Abrir em tamanho real"
    >
      <img
        src={receiptQuery.data.dataUrl}
        alt="Comprovante Pix"
        className="max-h-[28rem] w-auto rounded-xl border border-emerald-500/20"
      />
    </a>
  );
}
