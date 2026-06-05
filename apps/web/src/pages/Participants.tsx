import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Link } from 'react-router-dom';
import { api, ApiError } from '../lib/api';

interface ParticipantListItem {
  userId: string;
  name: string;
  points: number;
  exactScores: number;
}

export function Participants() {
  const [search, setSearch] = useState('');

  const query = useQuery({
    queryKey: ['participants'],
    queryFn: () => api<ParticipantListItem[]>('/profiles'),
    staleTime: 60_000,
  });

  if (query.isLoading) {
    return <p className="text-emerald-200/70">Carregando participantes...</p>;
  }
  if (query.error) {
    const err = query.error as Error;
    return (
      <div className="card-glow text-red-200">
        <p>{err.message}</p>
        {err instanceof ApiError && err.status === 403 && (
          <p className="mt-2 text-sm text-emerald-200/70">
            Esta área é exclusiva para participantes do bolão.{' '}
            <Link to="/pay" className="link-accent">
              Garantir minha vaga →
            </Link>
          </p>
        )}
      </div>
    );
  }

  const items = (query.data ?? []).filter((p) =>
    p.name.toLowerCase().includes(search.trim().toLowerCase()),
  );

  return (
    <div className="space-y-6">
      <header className="space-y-2">
        <p className="text-xs font-bold tracking-[0.4em] text-gold-400">PARTICIPANTES</p>
        <h1 className="font-display text-2xl sm:text-3xl tracking-wider text-white">
          <span className="text-shimmer">QUEM ESTÁ NO BOLÃO</span>
        </h1>
        <p className="text-sm text-emerald-200/70 max-w-2xl">
          Toque em um participante para ver os palpites dele. Os palpites alheios só ficam
          visíveis após o início de cada jogo, então ninguém copia. Os seus, você vê a qualquer
          momento.
        </p>
      </header>

      <input
        type="search"
        className="input w-full sm:max-w-md"
        placeholder="🔎 Buscar por nome"
        value={search}
        onChange={(e) => setSearch(e.target.value)}
      />

      {items.length === 0 ? (
        <p className="text-sm text-emerald-200/60">
          {search ? 'Nenhum participante com esse nome.' : 'Ainda não há participantes ativos.'}
        </p>
      ) : (
        <ul className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
          {items.map((p, idx) => (
            <li key={p.userId}>
              <Link
                to={`/participantes/${p.userId}`}
                className="block rounded-xl border border-emerald-500/15 bg-midnight-900/40 px-3 py-3 hover:border-gold-400/40 hover:bg-midnight-800/60 transition"
              >
                <div className="flex items-center gap-3">
                  <div className="h-10 w-10 rounded-full bg-gradient-to-br from-emerald-400 to-emerald-700 grid place-items-center text-white font-bold shadow shrink-0">
                    {p.name.charAt(0).toUpperCase()}
                  </div>
                  <div className="min-w-0 flex-1">
                    <p className="font-semibold text-emerald-50 truncate">{p.name}</p>
                    <p className="text-[11px] text-emerald-200/60">
                      <span className="text-gold-300 font-mono">{p.points}</span> pts ·{' '}
                      <span className="text-emerald-300">{p.exactScores}</span> exatos
                    </p>
                  </div>
                  <span className="text-[10px] font-mono text-emerald-300/60 shrink-0">
                    #{idx + 1}
                  </span>
                </div>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
