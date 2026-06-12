import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Link } from 'react-router-dom';
import { api, ApiError } from '../lib/api';
import { BracketSlot } from '../components/BracketSlot';
import { ManualTiebreakResolver } from '../components/ManualTiebreakResolver';
import { flagUrl } from '../lib/flags';
import type {
  BracketPreviewDto,
  GroupLetter,
  GroupStandingDto,
  KnockoutStage,
  MyKnockoutGuessesDto,
} from '@bolao/shared';

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
  const qc = useQueryClient();
  const bracketQuery = useQuery({
    queryKey: ['bracket-preview'],
    queryFn: () => api<BracketPreviewDto>('/guesses/bracket-preview'),
  });

  // Palpites de placar de KO do jogador, pra mostrar "palpite × real" no bracket.
  const koQuery = useQuery({
    queryKey: ['knockout-guesses'],
    queryFn: () => api<MyKnockoutGuessesDto>('/guesses/knockout'),
  });

  const tiebreakMutation = useMutation({
    mutationFn: (orders: Array<{ groupLetter: GroupLetter; teamCodes: string[] }>) =>
      api<{ bracket: BracketPreviewDto }>('/guesses/manual-tiebreak', {
        method: 'PUT',
        body: JSON.stringify({ orders }),
      }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['bracket-preview'] });
    },
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
  const champion = bracket.fixtures.find((f) => f.id === 'F-104')?.predictedWinnerCode;
  const thirdPlace = bracket.fixtures.find((f) => f.id === 'TP-103')?.predictedWinnerCode;
  const koScores = koQuery.data?.scores ?? {};
  const officialResults = bracket.official?.results ?? {};
  // Quando há resultados oficiais, mostramos a classificação que o jogador
  // palpitou LADO A LADO com a classificação real de cada grupo. Os 8 melhores
  // 3º passam a exibir o resultado oficial quando disponível.
  const hasOfficialGroups =
    bracket.official && Object.keys(bracket.official.groups).length > 0;
  const displayThirds =
    hasOfficialGroups && bracket.official!.bestThirds.length > 0
      ? bracket.official!.bestThirds
      : bracket.bestThirds;

  return (
    <div className="space-y-8">
      <header className="flex items-end justify-between flex-wrap gap-3">
        <div>
          <p className="text-xs font-bold tracking-[0.4em] text-gold-400">SEU CAMINHO</p>
          <h1 className="font-display text-4xl tracking-wider text-white mt-1">
            <span className="text-shimmer">CHAVEAMENTO PREVISTO</span>
          </h1>
          <p className="text-sm text-emerald-200/70 mt-2">
            Derivado dos seus palpites de grupo. Os times e resultados são atualizados automaticamente conforme a competição avança, mas as previsões de campeão e 3º lugar não mudam.
          </p>
        </div>
        <Link to="/guesses" className="btn-secondary text-sm">
          ← Editar palpites
        </Link>
      </header>

      <ManualTiebreakResolver
        bracket={bracket}
        saving={tiebreakMutation.isPending}
        onSave={(orders) => tiebreakMutation.mutate(orders)}
      />

      {tiebreakMutation.error && (
        <p className="text-sm text-red-200 bg-red-500/10 border border-red-400/30 rounded-xl p-3">
          {(tiebreakMutation.error as Error).message}
        </p>
      )}

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
          {hasOfficialGroups && (
            <span className="ml-2 text-xs font-normal text-gold-300/80 tracking-normal">
              · seu palpite × resultado real
            </span>
          )}
        </h2>
        <div
          className={
            'grid gap-3 ' +
            (hasOfficialGroups ? 'sm:grid-cols-1 lg:grid-cols-2' : 'sm:grid-cols-2 lg:grid-cols-3')
          }
        >
          {Object.entries(bracket.groups).map(([letter, predicted]) => {
            const official = bracket.official?.groups[letter as GroupLetter];
            const officialPositions = official
              ? Object.fromEntries(official.map((s) => [s.teamCode, s.position]))
              : undefined;
            return (
              <div
                key={letter}
                className="rounded-xl border border-emerald-500/15 bg-midnight-900/60 p-3"
              >
                <p className="text-[10px] tracking-[0.3em] text-gold-300/80 mb-2">GRUPO {letter}</p>
                {official ? (
                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <p className="text-[9px] uppercase tracking-[0.2em] text-emerald-300/60 mb-1">
                        Seu palpite
                      </p>
                      <GroupStandingsTable
                        standings={predicted}
                        officialPositions={officialPositions}
                      />
                    </div>
                    <div>
                      <p className="text-[9px] uppercase tracking-[0.2em] text-gold-300/70 mb-1">
                        Resultado real
                      </p>
                      <GroupStandingsTable standings={official} />
                    </div>
                  </div>
                ) : (
                  <GroupStandingsTable standings={predicted} />
                )}
              </div>
            );
          })}
        </div>
      </section>

      {displayThirds.length > 0 && (
        <section className="card">
          <h2 className="font-display text-xl tracking-wider text-emerald-100/80 mb-3">
            8 Melhores 3º colocados
            {hasOfficialGroups && bracket.official!.bestThirds.length > 0 && (
              <span className="ml-2 text-xs font-normal text-gold-300/80 tracking-normal">
                · resultado oficial
              </span>
            )}
          </h2>
          <div className="flex flex-wrap gap-2">
            {displayThirds.map((t) => {
              const url = flagUrl(t.teamCode);
              return (
                <span key={t.teamCode} className="chip gap-2">
                  {url && (
                    <img
                      src={url}
                      alt=""
                      loading="lazy"
                      className="w-4 h-3 object-cover rounded-[2px] ring-1 ring-black/20"
                    />
                  )}
                  #{t.bestThirdRank} · {t.teamCode} (G{t.groupLetter})
                </span>
              );
            })}
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
                      <BracketSlot
                        key={f.id}
                        fixture={f}
                        guess={koScores[f.id]}
                        official={officialResults[f.id]}
                      />
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

/**
 * Tabela compacta de classificação de um grupo. Quando `officialPositions` é
 * fornecido (tabela de palpite ao lado do resultado real), marca com ✓ os times
 * que o jogador acertou exatamente a posição.
 */
function GroupStandingsTable({
  standings,
  officialPositions,
}: {
  standings: GroupStandingDto[];
  officialPositions?: Record<string, number>;
}) {
  return (
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
        {standings.map((s) => {
          const url = flagUrl(s.teamCode);
          const correct =
            officialPositions !== undefined && officialPositions[s.teamCode] === s.position;
          return (
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
              <td className="whitespace-nowrap">
                {s.position}
                {correct && <span className="text-emerald-400 ml-0.5">✓</span>}
              </td>
              <td>
                <span className="flex items-center gap-1.5">
                  {url && (
                    <img
                      src={url}
                      alt=""
                      loading="lazy"
                      className="w-4 h-3 object-cover rounded-[2px] ring-1 ring-black/20"
                    />
                  )}
                  {s.teamCode}
                </span>
              </td>
              <td className="text-right">{s.points}</td>
              <td className="text-right">
                {s.goalDifference >= 0 ? `+${s.goalDifference}` : s.goalDifference}
              </td>
            </tr>
          );
        })}
      </tbody>
    </table>
  );
}
