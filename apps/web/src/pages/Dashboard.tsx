import { useQuery } from '@tanstack/react-query';
import { Link } from 'react-router-dom';
import { api } from '../lib/api';
import { useAuth } from '../lib/auth';

type SubscriptionStatus = {
  id?: string;
  status: 'pending_payment' | 'active' | 'refunded' | 'not_subscribed';
  amountCents?: number;
  paidAt?: string | null;
};

export function Dashboard() {
  const { user } = useAuth();
  const { data, isLoading } = useQuery({
    queryKey: ['subscription-status'],
    queryFn: () => api<SubscriptionStatus>('/subscription/status'),
  });

  if (isLoading) return <p className="text-emerald-200/70">Carregando...</p>;

  const status = data?.status ?? 'not_subscribed';

  return (
    <div className="space-y-8">
      <header className="flex items-end justify-between flex-wrap gap-3">
        <div>
          <p className="text-xs font-bold tracking-[0.4em] text-gold-400">SUA CENTRAL</p>
          <h1 className="font-display text-4xl tracking-wider text-white mt-1">
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
          <h2 className="font-display text-2xl tracking-wider text-white">INSCRIÇÃO · BOLÃO GERAL</h2>
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
                Palpitar nos 72 jogos →
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
                Bolões paralelos
              </Link>
            </div>
          </div>
        )}
        {status === 'refunded' && (
          <p className="mt-3 text-sm text-emerald-100/70 bg-slate-700/30 border border-slate-500/30 rounded-xl p-4">
            Sua inscrição foi reembolsada. Entre em contato com o admin se isso foi inesperado.
          </p>
        )}
      </section>

      <section className="card">
        <div className="flex items-center gap-3 mb-4">
          <div className="h-10 w-10 rounded-xl bg-gradient-to-br from-emerald-400 to-emerald-700 grid place-items-center text-white text-xl shadow-md">
            🗓️
          </div>
          <h2 className="font-display text-2xl tracking-wider text-white">ROADMAP DO MVP</h2>
        </div>
        <ul className="mt-3 text-sm space-y-3">
          <RoadmapItem sprint="2" text="Tela de palpites de fase de grupos + Bracket Engine." />
          <RoadmapItem sprint="3" text="Integração Stripe real, ranking ao vivo, painel de prêmios." />
          <RoadmapItem sprint="4" text="Notificações por e-mail e push, polish, soft launch." />
        </ul>
      </section>
    </div>
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

function RoadmapItem({ sprint, text }: { sprint: string; text: string }) {
  return (
    <li className="flex items-start gap-3 p-3 rounded-xl border border-emerald-500/10 bg-emerald-900/15">
      <span className="shrink-0 h-7 w-7 rounded-lg bg-gold-500/20 border border-gold-400/30 grid place-items-center text-xs font-bold text-gold-300">
        S{sprint}
      </span>
      <span className="text-emerald-100/85">{text}</span>
    </li>
  );
}
