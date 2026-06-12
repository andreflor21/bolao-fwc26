import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Link } from 'react-router-dom';
import { api, ApiError } from '../lib/api';
import type { RankingDto } from '@bolao/shared';

interface SidePoolSummary {
  id: string;
  name: string;
  memberCount: number;
  isOwner: boolean;
}

type PoolChoice = { kind: 'general' } | { kind: 'side'; id: string; name: string };

export function Ranking() {
  const [choice, setChoice] = useState<PoolChoice>({ kind: 'general' });

  const sidePoolsQuery = useQuery({
    queryKey: ['side-pools', 'mine'],
    queryFn: () => api<SidePoolSummary[]>('/side-pools'),
    staleTime: 60_000,
  });

  const path =
    choice.kind === 'general'
      ? '/general-pool/ranking?limit=1000'
      : `/side-pools/${choice.id}/ranking?limit=1000`;

  const rankingQuery = useQuery({
    queryKey: ['ranking', choice],
    queryFn: () => api<RankingDto>(path),
    refetchInterval: 60_000,
  });

  if (rankingQuery.error) {
    const err = rankingQuery.error as Error;
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

  const ranking = rankingQuery.data;
  const sidePools = sidePoolsQuery.data ?? [];

  return (
    <div className="space-y-8">
      <header className="flex items-end justify-between flex-wrap gap-3">
        <div>
          <p className="text-xs font-bold tracking-[0.4em] text-gold-400">QUEM ESTÁ NA FRENTE</p>
          <h1 className="font-display text-4xl tracking-wider text-white mt-1">
            <span className="text-shimmer">RANKING</span>
          </h1>
          {ranking && (
            <p className="text-sm text-emerald-200/70 mt-2">
              {ranking.total} jogadores · atualizado a cada 60 s
            </p>
          )}
        </div>
        <div className="flex flex-col gap-1">
          <label className="text-[10px] tracking-[0.3em] text-gold-300/80">BOLÃO</label>
          <select
            className="input"
            value={choice.kind === 'general' ? 'general' : choice.id}
            onChange={(e) => {
              const v = e.target.value;
              if (v === 'general') {
                setChoice({ kind: 'general' });
              } else {
                const sp = sidePools.find((s) => s.id === v);
                if (sp) setChoice({ kind: 'side', id: sp.id, name: sp.name });
              }
            }}
          >
            <option value="general">Geral · todos inscritos</option>
            {sidePools.map((sp) => (
              <option key={sp.id} value={sp.id}>
                {sp.name} ({sp.memberCount})
              </option>
            ))}
          </select>
        </div>
      </header>

      {rankingQuery.isLoading ? (
        <p className="text-emerald-200/70">Carregando ranking...</p>
      ) : ranking?.rows.length === 0 ? (
        <div className="card-glow">
          <p className="text-emerald-100/80">
            Nenhuma pontuação registrada ainda. Volte aqui depois que o admin registrar os
            primeiros resultados.
          </p>
        </div>
      ) : (
        <section className="card">
          <table className="w-full table-fixed text-sm">
            <thead>
              <tr className="text-emerald-300/60 text-[11px] tracking-widest">
                <th className="text-left py-2 w-9">#</th>
                <th className="text-left py-2">JOGADOR</th>
                <th className="text-right py-2 w-16">PONTOS</th>
                <th className="text-right py-2 w-16">EXATOS</th>
              </tr>
            </thead>
            <tbody>
              {ranking?.rows.map((row) => (
                <tr
                  key={`${row.position}-${row.userId}`}
                  className={
                    'border-t border-emerald-500/10 ' +
                    (row.isOwn
                      ? 'bg-gold-400/10 text-gold-100 font-semibold'
                      : row.position <= 3
                      ? 'text-emerald-50'
                      : 'text-emerald-100/85')
                  }
                >
                  <td className="py-2">
                    {row.position <= 3 ? (
                      <span className="font-display text-gold-300 text-lg">
                        {row.position}
                      </span>
                    ) : (
                      row.position
                    )}
                  </td>
                  <td className="py-2 pr-2 break-words">
                    {row.name}
                    {row.isOwn && <span className="ml-2 chip text-[10px]">você</span>}
                  </td>
                  <td className="py-2 text-right font-display text-base">{row.points}</td>
                  <td className="py-2 text-right">{row.exactScores}</td>
                </tr>
              ))}
            </tbody>
          </table>

          {ranking?.ownPosition && ranking.ownPosition > ranking.rows.length && (
            <p className="mt-4 text-xs text-emerald-200/70">
              Sua posição: <span className="text-gold-200 font-semibold">{ranking.ownPosition}º</span>
              {' '}de {ranking.total}.
            </p>
          )}
        </section>
      )}
    </div>
  );
}
