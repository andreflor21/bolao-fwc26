import { useState } from 'react';
import { Link } from 'react-router-dom';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { api, apiDownload, ApiError } from '../../lib/api';
import type { AdminPrizePayoutDto, ClosureSnapshotDto } from '@bolao/shared';
import { AdminPageHeader } from '../../components/admin/AdminPageHeader';
import { AdminModal } from '../../components/admin/AdminModal';

function brl(cents: number): string {
  return (cents / 100).toLocaleString('pt-BR', {
    style: 'currency',
    currency: 'BRL',
  });
}

function formatDateTime(iso: string): string {
  const d = new Date(iso);
  return d.toLocaleString('pt-BR', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
}

export function AdminPrizes() {
  const qc = useQueryClient();
  const [markingPayout, setMarkingPayout] = useState<AdminPrizePayoutDto | null>(null);
  const [reference, setReference] = useState('');
  const [csvLoading, setCsvLoading] = useState(false);
  const [csvError, setCsvError] = useState<string | null>(null);

  const snapshotQuery = useQuery({
    queryKey: ['admin-payouts'],
    queryFn: () => api<ClosureSnapshotDto>('/admin/prizes'),
    retry: (failureCount, err) => {
      if (err instanceof ApiError && err.status === 409) return false;
      return failureCount < 2;
    },
  });

  const markPaidMutation = useMutation({
    mutationFn: ({ payoutId, paymentReference }: { payoutId: string; paymentReference: string | undefined }) =>
      api<AdminPrizePayoutDto>(`/admin/prizes/payouts/${payoutId}/mark-paid`, {
        method: 'POST',
        body: JSON.stringify({ paymentReference: paymentReference || undefined }),
      }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['admin-payouts'] });
      setMarkingPayout(null);
      setReference('');
    },
  });

  async function downloadCsv() {
    setCsvError(null);
    setCsvLoading(true);
    try {
      await apiDownload('/admin/prizes/payout-report', 'payouts-fifa-wc-2026.csv');
    } catch (e) {
      setCsvError(e instanceof Error ? e.message : 'Falha ao baixar CSV');
    } finally {
      setCsvLoading(false);
    }
  }

  if (snapshotQuery.isLoading) {
    return <p className="text-emerald-200/70">Carregando snapshot de prêmios...</p>;
  }
  if (snapshotQuery.error) {
    const err = snapshotQuery.error as Error;
    if (err instanceof ApiError && err.status === 409) {
      return (
        <div className="space-y-4">
          <header>
            <p className="text-xs font-bold tracking-[0.4em] text-gold-400">PREMIAÇÃO</p>
            <h1 className="font-display text-3xl tracking-wider text-white mt-1">
              <span className="text-shimmer">PAYOUTS</span>
            </h1>
          </header>
          <div className="card-glow border-emerald-400/30">
            <p className="text-sm text-emerald-100/85">
              ⏳ A competição ainda não foi encerrada. A tabela de payouts é gerada quando
              você roda o encerramento em{' '}
              <Link to="/admin/closure" className="link-accent">
                /admin/closure
              </Link>
              .
            </p>
          </div>
        </div>
      );
    }
    return <p className="text-red-200">{err.message}</p>;
  }

  const snap = snapshotQuery.data!;
  const totalPaid = snap.payouts
    .filter((p) => p.paidAt !== null)
    .reduce((a, p) => a + p.amountCents, 0);
  const pendingCount = snap.payouts.filter(
    (p) => p.paidAt === null && p.user !== null,
  ).length;

  return (
    <div className="space-y-6">
      <AdminPageHeader
        title="PAYOUTS"
        subtitle={
          <>
            {snap.payouts.length} prêmios congelados em{' '}
            {snap.finalizedAt ? formatDateTime(snap.finalizedAt) : '—'}. Marque cada
            pagamento conforme você processa o Pix.
          </>
        }
        actions={
          <button
            className="btn-secondary text-sm"
            onClick={downloadCsv}
            disabled={csvLoading}
          >
            {csvLoading ? 'Baixando...' : '⬇ Baixar CSV'}
          </button>
        }
      />

      {csvError && (
        <p className="text-sm text-red-200 bg-red-500/10 border border-red-400/30 rounded-xl p-3">
          {csvError}
        </p>
      )}

      <div className="grid gap-3 sm:grid-cols-3">
        <StatCard label="Pool total" value={brl(snap.poolTotalCents)} />
        <StatCard label="Pago" value={brl(totalPaid)} sub={`de ${brl(snap.totalDistributedCents)}`} />
        <StatCard label="Pagamentos pendentes" value={String(pendingCount)} sub="aguardando Pix" />
      </div>

      <div className="card overflow-x-auto">
        <table className="w-full text-sm min-w-[640px]">
          <thead className="text-xs text-emerald-300/70 uppercase tracking-wider">
            <tr className="text-left">
              <th className="px-3 py-2 font-medium">Categoria</th>
              <th className="px-3 py-2 font-medium">Jogador</th>
              <th className="px-3 py-2 font-medium text-right">Valor</th>
              <th className="px-3 py-2 font-medium">Status</th>
              <th className="px-3 py-2 font-medium text-right">Ação</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-emerald-500/10">
            {snap.payouts.map((p) => (
              <PayoutRow
                key={p.id}
                payout={p}
                onMarkPaid={() => {
                  setMarkingPayout(p);
                  setReference(p.paymentReference ?? '');
                }}
              />
            ))}
          </tbody>
        </table>
      </div>

      <AdminModal
        open={Boolean(markingPayout)}
        onClose={() => {
          setMarkingPayout(null);
          setReference('');
        }}
        title={
          <span className="font-display text-2xl text-white tracking-wider">
            {markingPayout?.paidAt ? 'ATUALIZAR PAGAMENTO' : 'MARCAR COMO PAGO'}
          </span>
        }
        footer={
          markingPayout && (
            <>
              <button
                className="btn-secondary text-sm"
                onClick={() => {
                  setMarkingPayout(null);
                  setReference('');
                }}
              >
                Cancelar
              </button>
              <button
                className="btn-gold text-sm"
                disabled={markPaidMutation.isPending}
                onClick={() =>
                  markPaidMutation.mutate({
                    payoutId: markingPayout.id,
                    paymentReference: reference || undefined,
                  })
                }
              >
                {markPaidMutation.isPending
                  ? 'Salvando...'
                  : markingPayout.paidAt
                  ? 'Atualizar referência'
                  : 'Confirmar pagamento'}
              </button>
            </>
          )
        }
      >
        {markingPayout && (
          <>
            <p className="text-sm text-emerald-100/80">
              <strong>{markingPayout.user?.name ?? '—'}</strong> · {markingPayout.categoryLabel}
              <br />
              <span className="text-gold-300">{brl(markingPayout.amountCents)}</span>
              {markingPayout.user?.pixKey && (
                <>
                  <br />
                  <span className="text-xs text-emerald-200/70 break-all">
                    Pix: <code>{markingPayout.user.pixKey}</code>
                  </span>
                </>
              )}
            </p>
            <label className="block text-xs text-emerald-200/70 mb-1">
              Referência (txid Pix, opcional)
            </label>
            <input
              type="text"
              className="input w-full"
              placeholder="Ex: E00000000202608180000000000000"
              value={reference}
              onChange={(e) => setReference(e.target.value)}
              maxLength={120}
            />
            {markPaidMutation.error && (
              <p className="text-sm text-red-200">
                {(markPaidMutation.error as Error).message}
              </p>
            )}
          </>
        )}
      </AdminModal>
    </div>
  );
}

function PayoutRow({
  payout,
  onMarkPaid,
}: {
  payout: AdminPrizePayoutDto;
  onMarkPaid: () => void;
}) {
  const isAdminSlot = payout.user === null;
  const paid = payout.paidAt !== null;
  return (
    <tr className={paid ? 'text-emerald-200/70' : 'text-emerald-100'}>
      <td className="px-3 py-2.5 whitespace-nowrap">
        <span className="font-mono text-xs text-gold-300/80 mr-2">
          {payout.displayPosition}º
        </span>
        {payout.categoryLabel}
      </td>
      <td className="px-3 py-2.5">
        {isAdminSlot ? (
          <span className="italic text-emerald-200/60">— Organização</span>
        ) : (
          <span>
            <span className="font-semibold">{payout.user!.name}</span>
            <span className="block text-xs text-emerald-200/50">{payout.user!.email}</span>
          </span>
        )}
      </td>
      <td className="px-3 py-2.5 text-right font-mono text-gold-200 whitespace-nowrap">
        {brl(payout.amountCents)}
      </td>
      <td className="px-3 py-2.5 text-xs whitespace-nowrap">
        {isAdminSlot ? (
          <span className="text-emerald-200/50">N/A</span>
        ) : paid ? (
          <span className="text-emerald-300">
            ✓ Pago em {formatDateTime(payout.paidAt!)}
            {payout.paymentReference && (
              <span className="block text-[10px] text-emerald-200/50 font-mono truncate max-w-[200px]">
                ref: {payout.paymentReference}
              </span>
            )}
          </span>
        ) : (
          <span className="text-yellow-200">Pendente</span>
        )}
      </td>
      <td className="px-3 py-2.5 text-right whitespace-nowrap">
        {!isAdminSlot && (
          <button
            className={paid ? 'btn-secondary text-xs' : 'btn-gold text-xs'}
            onClick={onMarkPaid}
          >
            {paid ? 'Editar' : 'Marcar pago'}
          </button>
        )}
      </td>
    </tr>
  );
}

function StatCard({ label, value, sub }: { label: string; value: string; sub?: string }) {
  return (
    <div className="card-glow !p-3">
      <p className="text-[10px] tracking-[0.3em] text-gold-300/80 uppercase">{label}</p>
      <p className="font-display text-2xl text-shimmer mt-1">{value}</p>
      {sub && <p className="text-xs text-emerald-200/60 mt-1">{sub}</p>}
    </div>
  );
}
