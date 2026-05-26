import { useQuery } from '@tanstack/react-query';
import { Link } from 'react-router-dom';
import { api, ApiError } from '../lib/api';
import type { PrizesViewDto } from '@bolao/shared';

function formatBRL(cents: number): string {
  return (cents / 100).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
}

export function Prizes() {
  const prizesQuery = useQuery({
    queryKey: ['prizes'],
    queryFn: () => api<PrizesViewDto>('/general-pool/prizes'),
    refetchInterval: 60_000,
  });

  if (prizesQuery.isLoading) return <p className="text-emerald-200/70">Calculando prêmios...</p>;
  if (prizesQuery.error) {
    const err = prizesQuery.error as Error;
    return (
      <div className="card-glow text-red-200">
        <p>{err.message}</p>
        {err instanceof ApiError && err.status === 403 && (
          <p className="mt-2 text-sm text-emerald-100/80">
            Inscrição ativa necessária.{' '}
            <Link to="/dashboard" className="link-accent">
              Voltar
            </Link>
          </p>
        )}
      </div>
    );
  }

  const view = prizesQuery.data!;

  return (
    <div className="space-y-8">
      <header>
        <p className="text-xs font-bold tracking-[0.4em] text-gold-400">MILHEIROS</p>
        <h1 className="font-display text-4xl tracking-wider text-white mt-1">
          <span className="text-shimmer">PRÊMIOS</span>
        </h1>
        <p className="text-sm text-emerald-200/70 mt-2">
          Pool total atual: <span className="text-gold-200 font-bold">{formatBRL(view.poolTotalCents)}</span>
          {' '}({view.totalSubscribers} inscritos) · valores se ajustam a cada nova inscrição.
        </p>
      </header>

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {view.prizes.map((p) => (
          <div
            key={p.category}
            className={
              'card-glow flex flex-col gap-2 ' +
              (p.category === 'first' ? 'border-gold-400/40' : '')
            }
          >
            <div className="flex items-baseline justify-between gap-2">
              <h2 className="font-display text-xl tracking-wider text-white">{p.label}</h2>
              <span className="text-[10px] text-emerald-300/70 tracking-widest">
                {(p.percentage * 100).toFixed(0)}%
              </span>
            </div>
            <p className="font-display text-3xl text-shimmer">{formatBRL(p.valueCents)}</p>
            {p.currentLeaders.length === 0 ? (
              <p className="text-xs text-emerald-200/50 italic">— aguardando líder —</p>
            ) : (
              <ul className="text-xs text-emerald-100/85 space-y-0.5">
                {p.currentLeaders.map((l) => (
                  <li key={l.userId} className="flex items-center justify-between">
                    <span className="truncate">{l.name}</span>
                    <span className="text-gold-200 font-semibold">
                      {p.category === 'exact_score_king' ? `${l.metric} exatos` : `${l.metric} pts`}
                    </span>
                  </li>
                ))}
              </ul>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}
