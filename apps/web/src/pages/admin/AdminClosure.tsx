import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { api, ApiError } from '../../lib/api';
import type {
  ClosurePrecheckDto,
  ClosureSnapshotDto,
} from '@bolao/shared';

function brl(cents: number): string {
  return (cents / 100).toLocaleString('pt-BR', {
    style: 'currency',
    currency: 'BRL',
  });
}

export function AdminClosure() {
  const navigate = useNavigate();
  const qc = useQueryClient();
  const [showConfirm, setShowConfirm] = useState(false);
  const [acknowledged, setAcknowledged] = useState(false);
  const [allowIncompleteKO, setAllowIncompleteKO] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const precheckQuery = useQuery({
    queryKey: ['admin-closure-precheck'],
    queryFn: () => api<ClosurePrecheckDto>('/admin/closure/precheck'),
    refetchInterval: 10_000,
  });

  const finalizeMutation = useMutation({
    mutationFn: () =>
      api<ClosureSnapshotDto>('/admin/closure/finalize', {
        method: 'POST',
        body: JSON.stringify({ confirmIncompleteKnockouts: allowIncompleteKO }),
      }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['admin-closure-precheck'] });
      qc.invalidateQueries({ queryKey: ['admin-payouts'] });
      setShowConfirm(false);
      navigate('/admin/prizes');
    },
    onError: (e: unknown) => {
      setError(e instanceof ApiError ? e.message : 'Falha ao encerrar competição');
    },
  });

  if (precheckQuery.isLoading) {
    return <p className="text-emerald-200/70">Carregando estado da competição...</p>;
  }
  if (precheckQuery.error || !precheckQuery.data) {
    return (
      <p className="text-red-200">
        {(precheckQuery.error as Error | undefined)?.message ?? 'Falha ao carregar precheck'}
      </p>
    );
  }

  const pre = precheckQuery.data;
  const alreadyFinalized = pre.closureStatus === 'finalized';
  const canFinalize =
    pre.groupComplete && (pre.knockoutComplete || allowIncompleteKO) && !alreadyFinalized;

  return (
    <div className="space-y-6">
      <header>
        <p className="text-xs font-bold tracking-[0.4em] text-gold-400">FIM-DE-JOGO</p>
        <h1 className="font-display text-3xl tracking-wider text-white mt-1">
          <span className="text-shimmer">ENCERRAMENTO</span>
        </h1>
        <p className="text-sm text-emerald-200/70 mt-2 max-w-2xl">
          Encerrar a competição congela o ranking, gera a tabela de payouts e marca a
          competição como <code>finalized</code>. Esta ação é <strong>irreversível</strong>.
        </p>
      </header>

      {alreadyFinalized && (
        <div className="card-glow border-gold-400/40 bg-gold-400/5">
          <p className="text-sm text-gold-100">
            ✓ Competição já encerrada. Os payouts estão disponíveis em{' '}
            <button
              className="link-accent"
              onClick={() => navigate('/admin/prizes')}
            >
              /admin/prizes
            </button>
            .
          </p>
        </div>
      )}

      <section className="card-glow space-y-4">
        <h2 className="font-display text-xl tracking-wider text-emerald-100/80">
          Pré-condições
        </h2>
        <ul className="space-y-2 text-sm">
          <PrecheckRow
            label="Resultados oficiais da fase de grupos"
            ok={pre.groupComplete}
            detail={`${pre.groupMatchesWithResult}/${pre.groupMatchesTotal}`}
          />
          <PrecheckRow
            label="Resultados oficiais da fase eliminatória"
            ok={pre.knockoutComplete}
            detail={`${pre.knockoutMatchesWithResult}/${pre.knockoutMatchesTotal}`}
          />
          <PrecheckRow
            label="Inscrições ativas"
            ok={pre.totalSubscribers > 0}
            detail={String(pre.totalSubscribers)}
          />
        </ul>
        <div className="text-xs text-emerald-200/70 border-t border-emerald-500/20 pt-3">
          Pool total estimado: <strong>{brl(pre.poolTotalCents)}</strong>
        </div>

        {!pre.knockoutComplete && !alreadyFinalized && (
          <label className="flex items-start gap-2 text-xs text-emerald-100/80 cursor-pointer">
            <input
              type="checkbox"
              checked={allowIncompleteKO}
              onChange={(e) => setAllowIncompleteKO(e.target.checked)}
              className="mt-0.5"
            />
            <span>
              Encerrar mesmo com fase eliminatória incompleta. Os payouts serão calculados
              sobre o ranking atual, sem aguardar os {pre.knockoutMatchesTotal - pre.knockoutMatchesWithResult}{' '}
              jogo(s) restante(s).
            </span>
          </label>
        )}
      </section>

      {error && (
        <p className="text-sm text-red-200 bg-red-500/10 border border-red-400/30 rounded-xl p-3">
          {error}
        </p>
      )}

      <div className="flex justify-end">
        <button
          className="btn-gold text-base px-8 py-3"
          disabled={!canFinalize || finalizeMutation.isPending}
          onClick={() => setShowConfirm(true)}
        >
          {finalizeMutation.isPending ? 'Encerrando...' : '🔒 Encerrar competição'}
        </button>
      </div>

      {showConfirm && (
        <div
          className="fixed inset-0 z-40 grid place-items-center bg-black/70 p-4"
          onClick={() => setShowConfirm(false)}
        >
          <div
            className="card-glow max-w-md w-full"
            onClick={(e) => e.stopPropagation()}
          >
            <h3 className="font-display text-2xl text-white tracking-wider mb-3">
              CONFIRMAR ENCERRAMENTO
            </h3>
            <p className="text-sm text-emerald-100/85 mb-3">
              Esta ação é <strong>IRREVERSÍVEL</strong>. Após encerrar:
            </p>
            <ul className="text-sm text-emerald-100/80 list-disc list-inside space-y-1 mb-4">
              <li>O ranking é congelado e os prêmios são distribuídos</li>
              <li>Palpites e resultados oficiais não podem mais ser editados</li>
              <li>A página /admin/prizes habilita o botão "marcar como pago"</li>
            </ul>
            <label className="flex items-start gap-2 text-xs text-emerald-100/80 mb-4 cursor-pointer">
              <input
                type="checkbox"
                checked={acknowledged}
                onChange={(e) => setAcknowledged(e.target.checked)}
                className="mt-0.5"
              />
              <span>Eu entendo que essa ação é irreversível.</span>
            </label>
            <div className="flex justify-end gap-2">
              <button
                className="btn-secondary text-sm"
                onClick={() => {
                  setShowConfirm(false);
                  setAcknowledged(false);
                }}
              >
                Cancelar
              </button>
              <button
                className="btn-gold text-sm"
                disabled={!acknowledged || finalizeMutation.isPending}
                onClick={() => finalizeMutation.mutate()}
              >
                {finalizeMutation.isPending ? 'Encerrando...' : 'Confirmar encerramento'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

function PrecheckRow({
  label,
  ok,
  detail,
}: {
  label: string;
  ok: boolean;
  detail: string;
}) {
  return (
    <li className="flex items-center justify-between gap-3">
      <span className="text-emerald-100/85">{label}</span>
      <span
        className={
          'font-mono text-xs px-2 py-1 rounded-full ' +
          (ok
            ? 'bg-emerald-500/20 text-emerald-100 border border-emerald-400/40'
            : 'bg-red-500/15 text-red-100 border border-red-400/40')
        }
      >
        {ok ? '✓ ' : '✗ '}
        {detail}
      </span>
    </li>
  );
}
