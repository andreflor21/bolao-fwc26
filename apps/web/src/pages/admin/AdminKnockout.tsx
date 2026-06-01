import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { api, ApiError } from '../../lib/api';
import { flagUrl } from '../../lib/flags';

interface KnockoutFixture {
  matchId: string;
  fixtureId: string | null;
  stage: 'r32' | 'r16' | 'qf' | 'sf' | 'tp' | 'final';
  kickoffAt: string;
  city: string | null;
  homeTeamCode: string | null;
  homeTeamName: string | null;
  awayTeamCode: string | null;
  awayTeamName: string | null;
  homeGoals: number | null;
  awayGoals: number | null;
  advancesTeamCode: string | null;
  hasResult: boolean;
  teamsResolved: boolean;
}

const STAGE_LABEL: Record<KnockoutFixture['stage'], string> = {
  r32: '16-avos',
  r16: 'Oitavas',
  qf: 'Quartas',
  sf: 'Semifinal',
  tp: '3º lugar',
  final: 'Final',
};
const STAGE_ORDER: KnockoutFixture['stage'][] = ['r32', 'r16', 'qf', 'sf', 'tp', 'final'];

const BRT = new Intl.DateTimeFormat('pt-BR', {
  day: '2-digit',
  month: 'short',
  hour: '2-digit',
  minute: '2-digit',
  timeZone: 'America/Sao_Paulo',
});

function Flag({ code }: { code: string | null }) {
  const url = flagUrl(code);
  if (!url) return <span className="inline-block w-6 h-4 rounded-sm bg-emerald-500/15" />;
  return <img src={url} alt="" className="inline-block w-6 h-4 rounded-sm object-cover" />;
}

export function AdminKnockout() {
  const qc = useQueryClient();
  const [error, setError] = useState<string | null>(null);

  const fixturesQuery = useQuery({
    queryKey: ['admin-knockout-fixtures'],
    queryFn: () => api<KnockoutFixture[]>('/admin/knockout/fixtures'),
    refetchInterval: 60_000,
  });

  const regenMutation = useMutation({
    mutationFn: () =>
      api<{ generated: boolean; needsManualTiebreak?: unknown }>('/admin/knockout/recompute', {
        method: 'POST',
      }),
    onSuccess: (data) => {
      if (!data.generated) {
        setError(
          'Não foi possível gerar: há empate de classificação que precisa de ordem manual ' +
            '(grupos: ' +
            JSON.stringify(data.needsManualTiebreak) +
            '). Defina a ordem oficial e tente de novo.',
        );
      } else {
        setError(null);
      }
      qc.invalidateQueries({ queryKey: ['admin-knockout-fixtures'] });
    },
    onError: (e: unknown) =>
      setError(e instanceof ApiError ? e.message : 'Falha ao gerar chaveamento'),
  });

  const fixtures = fixturesQuery.data ?? [];
  const byStage = STAGE_ORDER.map((stage) => ({
    stage,
    items: fixtures.filter((f) => f.stage === stage),
  })).filter((g) => g.items.length > 0);

  return (
    <div className="space-y-6">
      <header className="flex items-end justify-between flex-wrap gap-3">
        <div>
          <p className="text-xs font-bold tracking-[0.4em] text-gold-400">MATA-MATA</p>
          <h1 className="font-display text-3xl tracking-wider text-white mt-1">
            <span className="text-shimmer">CHAVEAMENTO REAL</span>
          </h1>
          <p className="text-sm text-emerald-200/70 mt-2 max-w-2xl">
            Os confrontos são preenchidos automaticamente a partir dos resultados oficiais da
            fase de grupos. Lance os placares de cada jogo — o vencedor avança sozinho pra
            próxima fase e os palpites são pontuados.
          </p>
        </div>
        <button
          className="btn-secondary text-sm"
          disabled={regenMutation.isPending}
          onClick={() => regenMutation.mutate()}
        >
          {regenMutation.isPending ? 'Recalculando...' : '↻ Recalcular chaveamento'}
        </button>
      </header>

      {error && (
        <p className="text-sm text-red-200 bg-red-500/10 border border-red-400/30 rounded-xl p-3">
          {error}
        </p>
      )}

      {fixturesQuery.isLoading ? (
        <p className="text-emerald-200/70">Carregando confrontos...</p>
      ) : fixtures.length === 0 ? (
        <div className="card-glow">
          <p className="text-emerald-100/80">
            Nenhum confronto de mata-mata ainda. Rode o seed do mata-mata e finalize a fase de
            grupos.
          </p>
        </div>
      ) : (
        byStage.map((group) => (
          <section key={group.stage} className="space-y-3">
            <h2 className="font-display text-xl tracking-wider text-emerald-100/80">
              {STAGE_LABEL[group.stage]}
            </h2>
            <div className="grid gap-3 sm:grid-cols-2">
              {group.items.map((f) => (
                <KnockoutCard key={f.matchId} fixture={f} onError={setError} />
              ))}
            </div>
          </section>
        ))
      )}
    </div>
  );
}

function KnockoutCard({
  fixture,
  onError,
}: {
  fixture: KnockoutFixture;
  onError: (msg: string | null) => void;
}) {
  const qc = useQueryClient();
  const [home, setHome] = useState<string>(fixture.homeGoals?.toString() ?? '');
  const [away, setAway] = useState<string>(fixture.awayGoals?.toString() ?? '');
  const [advances, setAdvances] = useState<string>(fixture.advancesTeamCode ?? '');

  const isDraw = home !== '' && away !== '' && Number(home) === Number(away);

  const mutation = useMutation({
    mutationFn: () =>
      api(`/admin/knockout/${fixture.matchId}/result`, {
        method: 'PUT',
        body: JSON.stringify({
          homeGoals: Number(home),
          awayGoals: Number(away),
          advancesTeamCode: isDraw ? advances || null : null,
          confirmPreview: true,
        }),
      }),
    onSuccess: () => {
      onError(null);
      qc.invalidateQueries({ queryKey: ['admin-knockout-fixtures'] });
    },
    onError: (e: unknown) =>
      onError(e instanceof ApiError ? e.message : 'Falha ao lançar resultado'),
  });

  const canSubmit =
    fixture.teamsResolved &&
    home !== '' &&
    away !== '' &&
    (!isDraw || advances !== '') &&
    !mutation.isPending;

  return (
    <div className="rounded-xl border border-emerald-500/15 bg-midnight-900/40 px-3 py-3 space-y-2">
      <div className="flex items-center justify-between text-[11px] text-emerald-200/60">
        <span>{fixture.fixtureId}</span>
        <span>
          {BRT.format(new Date(fixture.kickoffAt))}
          {fixture.city ? ` · ${fixture.city}` : ''}
        </span>
      </div>

      {!fixture.teamsResolved ? (
        <p className="text-sm text-emerald-200/50 py-2 text-center">
          Times ainda não definidos (depende de fases anteriores).
        </p>
      ) : (
        <>
          <div className="grid grid-cols-[1fr,auto,1fr] items-center gap-2">
            <div className="flex items-center justify-end gap-2 min-w-0">
              <span className="text-sm font-semibold text-emerald-50 truncate">
                {fixture.homeTeamName ?? fixture.homeTeamCode}
              </span>
              <Flag code={fixture.homeTeamCode} />
            </div>
            <div className="flex items-center gap-1">
              <input
                inputMode="numeric"
                value={home}
                disabled={fixture.hasResult}
                onChange={(e) => setHome(e.target.value.replace(/\D/g, '').slice(0, 2))}
                className="w-11 h-10 rounded-lg border border-emerald-500/30 bg-midnight-800 text-center font-display text-lg text-white outline-none focus:border-gold-400/70 disabled:opacity-60"
                aria-label="Gols mandante"
              />
              <span className="text-emerald-300/40 font-bold">×</span>
              <input
                inputMode="numeric"
                value={away}
                disabled={fixture.hasResult}
                onChange={(e) => setAway(e.target.value.replace(/\D/g, '').slice(0, 2))}
                className="w-11 h-10 rounded-lg border border-emerald-500/30 bg-midnight-800 text-center font-display text-lg text-white outline-none focus:border-gold-400/70 disabled:opacity-60"
                aria-label="Gols visitante"
              />
            </div>
            <div className="flex items-center gap-2 min-w-0">
              <Flag code={fixture.awayTeamCode} />
              <span className="text-sm font-semibold text-emerald-50 truncate">
                {fixture.awayTeamName ?? fixture.awayTeamCode}
              </span>
            </div>
          </div>

          {isDraw && !fixture.hasResult && (
            <div className="flex items-center gap-2 justify-center text-xs">
              <span className="text-emerald-200/70">Quem avança (pênaltis):</span>
              <select
                value={advances}
                onChange={(e) => setAdvances(e.target.value)}
                className="bg-midnight-800 border border-emerald-500/30 rounded-lg px-2 py-1 text-emerald-50"
              >
                <option value="">—</option>
                <option value={fixture.homeTeamCode ?? ''}>{fixture.homeTeamCode}</option>
                <option value={fixture.awayTeamCode ?? ''}>{fixture.awayTeamCode}</option>
              </select>
            </div>
          )}

          {fixture.hasResult ? (
            <p className="text-center text-xs text-gold-200">
              ✓ Resultado lançado
              {fixture.advancesTeamCode ? ` · avançou ${fixture.advancesTeamCode}` : ''}
            </p>
          ) : (
            <div className="flex justify-end">
              <button
                className="btn-gold text-xs"
                disabled={!canSubmit}
                onClick={() => mutation.mutate()}
              >
                {mutation.isPending ? 'Lançando...' : 'Lançar resultado'}
              </button>
            </div>
          )}
        </>
      )}
    </div>
  );
}
