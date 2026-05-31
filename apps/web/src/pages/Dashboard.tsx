import { useQuery } from '@tanstack/react-query';
import { Link } from 'react-router-dom';
import type { MatchDto } from '@bolao/shared';
import { api } from '../lib/api';
import { useAuth } from '../lib/auth';
import { PushConsentBanner } from '../components/PushConsentBanner';
import { flagUrl } from '../lib/flags';

type SubscriptionStatus = {
  id?: string;
  status: 'pending_payment' | 'active' | 'refunded' | 'not_subscribed';
  amountCents?: number;
  paidAt?: string | null;
};

// Janela "ao vivo": começou e ainda não tem resultado oficial, dentro de 2,5h.
const LIVE_WINDOW_MS = 150 * 60 * 1000;

const BRT_TIME = new Intl.DateTimeFormat('pt-BR', {
  hour: '2-digit',
  minute: '2-digit',
  timeZone: 'America/Sao_Paulo',
});

export function Dashboard() {
  const { user } = useAuth();
  const { data, isLoading } = useQuery({
    queryKey: ['subscription-status'],
    queryFn: () => api<SubscriptionStatus>('/subscription/status'),
  });
  // Jogos ao vivo — refetch a cada 60s pra atualizar sozinho.
  const { data: matches } = useQuery({
    queryKey: ['matches-group-stage'],
    queryFn: () => api<MatchDto[]>('/matches/group-stage'),
    refetchInterval: 60_000,
  });
  const now = Date.now();
  const liveMatches = (matches ?? []).filter((m) => {
    const kickoff = new Date(m.kickoffAt).getTime();
    return (
      m.homeGoalsOfficial === null &&
      kickoff <= now &&
      now <= kickoff + LIVE_WINDOW_MS
    );
  });

  if (isLoading) return <p className="text-emerald-200/70">Carregando...</p>;

  const status = data?.status ?? 'not_subscribed';

  return (
    <div className="space-y-8">
      <PushConsentBanner />
      <header className="flex items-end justify-between flex-wrap gap-3">
        <div className="min-w-0">
          <p className="text-xs font-bold tracking-[0.4em] text-gold-400">SUA CENTRAL</p>
          <h1 className="font-display text-3xl sm:text-4xl tracking-wider text-white mt-1 break-words">
            OLÁ, <span className="text-shimmer">{user?.name.split(' ')[0]?.toUpperCase() ?? ''}</span>
          </h1>
        </div>
        <StatusBadge status={status} />
      </header>

      <section className="card-glow">
        <div className="flex items-center gap-3 mb-4">
          <div className="h-10 w-10 rounded-xl bg-gradient-to-br from-gold-300 to-gold-600 grid place-items-center text-midnight-900 text-xl shadow-md">
            🎯
          </div>
          <h2 className="font-display text-xl sm:text-2xl tracking-wider text-white">INSCRIÇÃO · BOLÃO GERAL</h2>
        </div>

        {status === 'not_subscribed' && (
          <div className="mt-3 space-y-4">
            <p className="text-sm text-emerald-100/80">
              Você ainda não está inscrito. A inscrição custa{' '}
              <strong className="text-gold-300">R$ 50</strong> via Pix e libera palpites no Geral + criação
              ilimitada de bolões paralelos.
            </p>
            <Link to="/pay" className="btn-gold inline-block">
              Quero me inscrever →
            </Link>
          </div>
        )}
        {status === 'pending_payment' && (
          <div className="mt-3 space-y-4">
            <p className="text-sm text-amber-200 bg-amber-500/10 border border-amber-500/30 rounded-xl p-4">
              ⏳ Sua inscrição está aguardando pagamento. Volte para a tela do Pix se ainda não pagou.
            </p>
            <Link to="/pay" className="btn-gold inline-block">
              Continuar pagamento →
            </Link>
          </div>
        )}
        {status === 'active' && (
          <div className="mt-3 space-y-4">
            <p className="text-sm text-emerald-100 bg-emerald-500/10 border border-emerald-500/30 rounded-xl p-4">
              ✅ Inscrição ativa! Você já pode submeter palpites e criar bolões paralelos.
            </p>
            <div className="flex flex-wrap gap-2">
              <Link to="/guesses" className="btn-gold">
                Dar palpites Fase de Grupos →
              </Link>
              <Link to="/knockout-guesses" className="btn-secondary">
                Palpites de mata-mata
              </Link>
              <Link to="/bracket" className="btn-secondary">
                Chaveamento previsto
              </Link>
              <Link to="/ranking" className="btn-secondary">
                Ranking
              </Link>
              <Link to="/prizes" className="btn-secondary">
                Prêmios
              </Link>
              <Link to="/side-pools" className="btn-secondary">
                Seus Bolões
              </Link>
            </div>
          </div>
        )}
        {status === 'refunded' && (
          <p className="mt-3 text-sm text-emerald-100/70 bg-slate-700/30 border border-slate-500/30 rounded-xl p-4">
            Sua inscrição foi reembolsada. Se isso foi inesperado, fale com o organizador:{' '}
            <a className="link-accent" href="mailto:contato@af-solutions.dev">
              contato@af-solutions.dev
            </a>
            .
          </p>
        )}
      </section>

      <section className="card">
        <div className="flex items-center gap-3 mb-4">
          <div className="h-10 w-10 rounded-xl bg-gradient-to-br from-red-500 to-red-700 grid place-items-center text-white text-xl shadow-md">
            {liveMatches.length > 0 ? '🔴' : '⚽'}
          </div>
          <h2 className="font-display text-xl sm:text-2xl tracking-wider text-white">JOGOS AO VIVO</h2>
          {liveMatches.length > 0 && (
            <span className="ml-auto inline-flex items-center gap-1.5 text-xs font-bold text-red-300">
              <span className="h-2 w-2 rounded-full bg-red-500 animate-pulse" />
              {liveMatches.length} agora
            </span>
          )}
        </div>
        {liveMatches.length === 0 ? (
          <p className="text-sm text-emerald-200/60">
            Nenhum jogo acontecendo agora. Volte na hora dos jogos! ⚽
          </p>
        ) : (
          <ul className="space-y-2">
            {liveMatches.map((m) => (
              <LiveMatchRow key={m.id} match={m} />
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}

function LiveMatchRow({ match }: { match: MatchDto }) {
  const home = flagUrl(match.homeTeamCode);
  const away = flagUrl(match.awayTeamCode);
  return (
    <li className="flex items-center gap-3 p-3 rounded-xl border border-red-500/20 bg-red-900/10">
      <span className="inline-flex items-center gap-1 text-[10px] font-bold text-red-300 shrink-0">
        <span className="h-2 w-2 rounded-full bg-red-500 animate-pulse" />
        AO VIVO
      </span>
      <div className="flex items-center gap-2 flex-1 min-w-0 justify-center">
        {home && <img src={home} alt="" className="w-6 h-4 rounded-sm object-cover shrink-0" />}
        <span className="text-sm text-emerald-50 truncate">
          {match.homeTeamName ?? match.homeTeamCode}
        </span>
        <span className="text-emerald-300/50 text-xs px-1">×</span>
        <span className="text-sm text-emerald-50 truncate">
          {match.awayTeamName ?? match.awayTeamCode}
        </span>
        {away && <img src={away} alt="" className="w-6 h-4 rounded-sm object-cover shrink-0" />}
      </div>
      <span className="text-[11px] text-emerald-200/50 shrink-0">
        início {BRT_TIME.format(new Date(match.kickoffAt))}
      </span>
    </li>
  );
}

function StatusBadge({ status }: { status: SubscriptionStatus['status'] }) {
  const map: Record<SubscriptionStatus['status'], { label: string; cls: string }> = {
    active: {
      label: '🟢 Inscrição ativa',
      cls: 'border-emerald-400/40 bg-emerald-500/15 text-emerald-200',
    },
    pending_payment: {
      label: '🟡 Pagamento pendente',
      cls: 'border-amber-400/40 bg-amber-500/15 text-amber-200',
    },
    not_subscribed: {
      label: '⚪ Não inscrito',
      cls: 'border-slate-400/30 bg-slate-500/15 text-slate-200',
    },
    refunded: {
      label: '↩️ Reembolsado',
      cls: 'border-slate-400/30 bg-slate-500/15 text-slate-300',
    },
  };
  const { label, cls } = map[status];
  return (
    <span
      className={'inline-flex items-center gap-2 rounded-full border px-4 py-1.5 text-xs font-semibold ' + cls}
    >
      {label}
    </span>
  );
}
