import { useQuery } from '@tanstack/react-query';
import { Link } from 'react-router-dom';
import { api, ApiError } from '../lib/api';
import { BracketSlot } from '../components/BracketSlot';
import type { BracketPreviewDto, KnockoutStage } from '@bolao/shared';

const STAGE_LABEL: Record<KnockoutStage, string> = {
  r32: 'Rodada de 32',
  r16: 'Oitavas',
  qf: 'Quartas',
  sf: 'Semifinais',
  final: 'Final',
  tp: 'Disputa do 3º',
};

const STAGE_ORDER: KnockoutStage[] = ['r32', 'r16', 'qf', 'sf', 'final', 'tp'];

export function BracketPreview() {
  const bracketQuery = useQuery({
    queryKey: ['bracket-preview'],
    queryFn: () => api<BracketPreviewDto>('/guesses/bracket-preview'),
  });

  if (bracketQuery.isLoading) {
    return <p className="text-emerald-200/70">Calculando chaveamento...</p>;
  }
  if (bracketQuery.error) {
    const err = bracketQuery.error as Error;
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

  const bracket = bracketQuery.data!;
  const champion = bracket.fixtures.find((f) => f.id === 'FINAL')?.predictedWinnerCode;
  const thirdPlace = bracket.fixtures.find((f) => f.id === 'TP')?.predictedWinnerCode;

  return (
    <div className="space-y-8">
      <header className="flex items-end justify-between flex-wrap gap-3">
        <div>
          <p className="text-xs font-bold tracking-[0.4em] text-gold-400">SEU CAMINHO</p>
          <h1 className="font-display text-4xl tracking-wider text-white mt-1">
            <span className="text-shimmer">CHAVEAMENTO PREVISTO</span>
          </h1>
          <p className="text-sm text-emerald-200/70 mt-2">
            Derivado dos seus palpites de grupo. Vencedores nos mata-matas são previstos por
            seed FIFA — apenas os placares de grupo contam para pontos hoje.
          </p>
        </div>
        <Link to="/guesses" className="btn-secondary text-sm">
          ← Editar palpites
        </Link>
      </header>

      {champion && (
        <section className="card-glow text-center">
          <p className="text-xs tracking-[0.4em] text-gold-400 mb-1">SEU CAMPEÃO</p>
          <p className="font-display text-5xl tracking-wider text-shimmer">{champion}</p>
          {thirdPlace && (
            <p className="text-xs text-emerald-200/70 mt-2">
              Terceiro lugar previsto: <span className="text-gold-200 font-semibold">{thirdPlace}</span>
            </p>
          )}
        </section>
      )}

      <section className="card">
        <h2 className="font-display text-xl tracking-wider text-emerald-100/80 mb-4">
          Classificações dos grupos
        </h2>
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {Object.entries(bracket.groups).map(([letter, standings]) => (
            <div key={letter} className="rounded-xl border border-emerald-500/15 bg-midnight-900/60 p-3">
              <p className="text-[10px] tracking-[0.3em] text-gold-300/80 mb-2">GRUPO {letter}</p>
              <table className="w-full text-xs">
                <thead className="text-emerald-300/50">
                  <tr>
                    <th className="text-left font-medium pb-1">#</th>
                    <th className="text-left font-medium pb-1">Time</th>
                    <th className="text-right font-medium pb-1">P</th>
                    <th className="text-right font-medium pb-1">SG</th>
                  </tr>
                </thead>
                <tbody>
                  {standings.map((s) => (
                    <tr
                      key={s.teamCode}
                      className={
                        s.position <= 2
                          ? 'text-gold-200 font-semibold'
                          : s.position === 3
                          ? 'text-emerald-100'
                          : 'text-emerald-200/60'
                      }
                    >
                      <td>{s.position}</td>
                      <td>{s.teamCode}</td>
                      <td className="text-right">{s.points}</td>
                      <td className="text-right">{s.goalDifference >= 0 ? `+${s.goalDifference}` : s.goalDifference}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ))}
        </div>
      </section>

      {bracket.bestThirds.length > 0 && (
        <section className="card">
          <h2 className="font-display text-xl tracking-wider text-emerald-100/80 mb-3">
            8 Melhores 3º colocados
          </h2>
          <div className="flex flex-wrap gap-2">
            {bracket.bestThirds.map((t) => (
              <span key={t.teamCode} className="chip">
                #{t.bestThirdRank} · {t.teamCode} (G{t.groupLetter})
              </span>
            ))}
          </div>
        </section>
      )}

      <section className="space-y-6">
        <h2 className="font-display text-xl tracking-wider text-emerald-100/80">
          Mata-mata
        </h2>
        <div className="overflow-x-auto pb-4">
          <div className="flex gap-6 min-w-max">
            {STAGE_ORDER.map((stage) => {
              const fixtures = bracket.fixtures.filter((f) => f.stage === stage);
              if (fixtures.length === 0) return null;
              return (
                <div key={stage} className="flex flex-col gap-3">
                  <p className="text-[10px] tracking-[0.3em] text-gold-300/80">
                    {STAGE_LABEL[stage].toUpperCase()}
                  </p>
                  <div className="flex flex-col gap-2 justify-around min-h-full">
                    {fixtures.map((f) => (
                      <BracketSlot key={f.id} fixture={f} />
                    ))}
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      </section>
    </div>
  );
}
