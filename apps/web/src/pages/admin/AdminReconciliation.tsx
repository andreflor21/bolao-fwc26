import { useState } from 'react';
import { useMutation } from '@tanstack/react-query';
import { api, ApiError } from '../../lib/api';
import { AdminPageHeader } from '../../components/admin/AdminPageHeader';

export function AdminReconciliation() {
  const [result, setResult] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const recomputeMutation = useMutation({
    mutationFn: () =>
      api<{ users: number }>('/admin/recompute', { method: 'POST' }),
    onSuccess: (data) => {
      setError(null);
      setResult(`Ranking recalculado para ${data.users} usuário(s).`);
    },
    onError: (e: unknown) => {
      setResult(null);
      setError(e instanceof ApiError ? e.message : 'Falha ao recalcular ranking');
    },
  });

  return (
    <div className="space-y-6">
      <AdminPageHeader
        title="RECONCILIAÇÃO"
        subtitle="Use estas ferramentas quando o estado do Redis sair de sincronia com o Postgres (ex: pós-importação, troca de instância Redis, ou bug de cache)."
      />

      <section className="card-glow space-y-3">
        <h2 className="font-display text-xl tracking-wider text-emerald-100/80">
          Recalcular ranking completo
        </h2>
        <p className="text-sm text-emerald-100/80">
          Lê todos os <code>guess_scores</code> do Postgres e reescreve os ZSETs do Redis do
          zero. Idempotente — pode rodar a qualquer momento. Tempo proporcional ao número
          de inscritos × jogos com resultado oficial.
        </p>
        <button
          className="btn-secondary text-sm"
          disabled={recomputeMutation.isPending}
          onClick={() => {
            if (window.confirm('Tem certeza? O ranking será recalculado para todos os inscritos.')) {
              recomputeMutation.mutate();
            }
          }}
        >
          {recomputeMutation.isPending ? 'Recalculando...' : 'Forçar recalculo do ranking'}
        </button>

        {result && (
          <p className="text-sm text-emerald-200 bg-emerald-500/10 border border-emerald-500/30 rounded-xl p-3">
            ✅ {result}
          </p>
        )}
        {error && (
          <p className="text-sm text-red-200 bg-red-500/10 border border-red-400/30 rounded-xl p-3">
            {error}
          </p>
        )}
      </section>
    </div>
  );
}
