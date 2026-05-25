import { Link } from 'react-router-dom';
import { useAuth } from '../lib/auth';
import { Trophy } from '../components/Trophy';

export function Landing() {
  const { user } = useAuth();

  return (
    <div className="space-y-16">
      {/* HERO */}
      <section className="relative overflow-hidden rounded-3xl border border-emerald-500/20 bg-gradient-to-br from-midnight-900 via-emerald-950 to-midnight-900 px-6 sm:px-12 py-12 sm:py-16">
        <div
          className="absolute inset-0 bg-hero-grid opacity-[0.07]"
          style={{ backgroundSize: '40px 40px' }}
        />
        <div className="absolute -top-24 -right-24 h-72 w-72 rounded-full bg-gold-500/20 blur-3xl" />
        <div className="absolute -bottom-32 -left-20 h-80 w-80 rounded-full bg-emerald-500/15 blur-3xl" />

        <div className="relative grid lg:grid-cols-[1.4fr,1fr] gap-10 items-center">
          <div>
            <span className="chip">
              <span className="h-1.5 w-1.5 rounded-full bg-gold-400 animate-pulse" />
              Inscrições abertas · 11 de junho de 2026
            </span>
            <h1 className="mt-5 font-display text-5xl sm:text-6xl lg:text-7xl tracking-wide leading-none">
              <span className="block text-white">BOLÃO</span>
              <span className="block text-shimmer">COPA DO MUNDO</span>
              <span className="block text-emerald-300/90 text-3xl sm:text-4xl mt-2 tracking-widest">
                FIFA 2026
              </span>
            </h1>
            <p className="mt-6 text-base sm:text-lg text-emerald-100/80 max-w-xl text-balance">
              48 seleções. 12 grupos. 104 partidas. Submeta seus palpites uma única vez, dispute o ranking
              geral e crie bolões paralelos com seus amigos — tudo a partir de uma inscrição única de{' '}
              <strong className="text-gold-300">R$ 50</strong>.
            </p>
            <div className="mt-8 flex flex-wrap gap-3">
              {user ? (
                <Link to="/dashboard" className="btn-gold text-base px-6 py-3">
                  Ir para o dashboard →
                </Link>
              ) : (
                <>
                  <Link to="/register" className="btn-gold text-base px-7 py-3">
                    Quero participar →
                  </Link>
                  <Link to="/login" className="btn-secondary text-base px-6 py-3">
                    Já tenho conta
                  </Link>
                </>
              )}
            </div>

            <div className="mt-10 grid grid-cols-3 gap-4 max-w-md">
              <Stat number="48" label="Seleções" />
              <Stat number="104" label="Partidas" />
              <Stat number="R$50" label="Inscrição" />
            </div>
          </div>

          <div className="relative grid place-items-center">
            <div className="absolute inset-0 rounded-full bg-gradient-to-tr from-gold-500/30 via-transparent to-emerald-400/20 blur-3xl" />
            <Trophy className="relative h-72 sm:h-80 lg:h-[26rem] w-auto animate-float drop-shadow-[0_30px_50px_rgba(245,158,11,0.45)]" />
          </div>
        </div>
      </section>

      {/* FEATURES */}
      <section>
        <div className="text-center mb-10">
          <p className="text-xs font-bold tracking-[0.4em] text-gold-400">VANTAGENS</p>
          <h2 className="mt-2 font-display text-3xl sm:text-4xl tracking-wider text-white">
            JOGUE COMO UM CRAQUE
          </h2>
        </div>

        <div className="grid md:grid-cols-3 gap-5">
          <FeatureCard
            icon="🏆"
            title="Bolão Geral"
            description="Premiação em dinheiro do 1º ao 5º colocado + bônus &quot;Rei dos Placares&quot;. Distribuição transparente de 95% do pool entre os vencedores."
            accent="gold"
          />
          <FeatureCard
            icon="👥"
            title="Bolões paralelos"
            description="Crie até 20 bolões com amigos, colegas e família. Sem cobrança adicional — sua inscrição no Geral já libera tudo."
            accent="emerald"
          />
          <FeatureCard
            icon="⚡"
            title="Ranking em tempo real"
            description="Sua pontuação é atualizada automaticamente a cada resultado oficial. Chaveamento de mata-mata gerado pelo regulamento da FIFA."
            accent="emerald"
          />
        </div>
      </section>

      {/* SCORING */}
      <section className="card-glow">
        <div className="flex items-center justify-between flex-wrap gap-3 mb-6">
          <div>
            <p className="text-xs font-bold tracking-[0.4em] text-gold-400">REGULAMENTO</p>
            <h2 className="mt-1 font-display text-3xl tracking-wider text-white">COMO PONTUA</h2>
          </div>
          <span className="chip">Pontuações não somam entre si</span>
        </div>

        <div className="grid sm:grid-cols-2 gap-3">
          <ScoreRow points="10" label="Placar exato" highlight />
          <ScoreRow points="8" label="Vencedor + gols de um dos times" />
          <ScoreRow points="6" label="Apenas o vencedor" />
          <ScoreRow points="4" label="Acertou que foi empate" />
          <ScoreRow points="2" label="Gols de um dos times" />
          <ScoreRow points="0" label="Errou tudo" muted />
        </div>

        <p className="mt-6 text-xs text-emerald-200/60 border-t border-emerald-500/10 pt-4">
          ⚽ Regra: cada jogo dá no máximo uma pontuação (a maior aplicável). Pontuações não somam entre si.
        </p>
      </section>
    </div>
  );
}

function Stat({ number, label }: { number: string; label: string }) {
  return (
    <div className="rounded-xl border border-emerald-500/20 bg-emerald-900/30 px-3 py-3 backdrop-blur">
      <p className="font-display text-2xl tracking-wider text-gold-300">{number}</p>
      <p className="text-[10px] tracking-widest font-semibold text-emerald-200/70 uppercase mt-0.5">
        {label}
      </p>
    </div>
  );
}

function FeatureCard({
  icon,
  title,
  description,
  accent,
}: {
  icon: string;
  title: string;
  description: string;
  accent: 'gold' | 'emerald';
}) {
  return (
    <div className="card relative overflow-hidden group hover:-translate-y-1 transition-transform">
      <div
        className={
          'absolute -top-12 -right-12 h-32 w-32 rounded-full blur-2xl opacity-40 group-hover:opacity-60 transition ' +
          (accent === 'gold' ? 'bg-gold-500' : 'bg-emerald-500')
        }
      />
      <div className="relative">
        <div className="text-3xl mb-3">{icon}</div>
        <h3
          className={
            'font-display text-2xl tracking-wider ' +
            (accent === 'gold' ? 'text-gold-300' : 'text-emerald-300')
          }
        >
          {title}
        </h3>
        <p
          className="mt-3 text-sm text-emerald-100/75 leading-relaxed"
          dangerouslySetInnerHTML={{ __html: description }}
        />
      </div>
    </div>
  );
}

function ScoreRow({
  points,
  label,
  highlight,
  muted,
}: {
  points: string;
  label: string;
  highlight?: boolean;
  muted?: boolean;
}) {
  return (
    <div
      className={
        'flex items-center gap-4 rounded-xl px-4 py-3 border transition ' +
        (highlight
          ? 'border-gold-400/40 bg-gradient-to-r from-gold-500/10 to-transparent'
          : muted
            ? 'border-slate-600/20 bg-slate-800/20'
            : 'border-emerald-500/15 bg-emerald-900/20 hover:bg-emerald-900/40')
      }
    >
      <div
        className={
          'font-display text-2xl tracking-wider w-16 text-center rounded-lg py-1 ' +
          (highlight
            ? 'bg-gradient-to-br from-gold-300 to-gold-600 text-midnight-900 shadow-lg shadow-amber-900/30'
            : muted
              ? 'text-slate-500'
              : 'text-emerald-300')
        }
      >
        {points}
      </div>
      <p
        className={
          'text-sm ' + (muted ? 'text-slate-500' : highlight ? 'text-gold-100 font-semibold' : 'text-emerald-100')
        }
      >
        {label}
      </p>
    </div>
  );
}
