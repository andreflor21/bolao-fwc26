import { useMemo, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { api, ApiError } from '../../lib/api';
import { flagUrl } from '../../lib/flags';
import type { MatchDto } from '@bolao/shared';

interface RegisterPreview {
  applied: false;
  preview: {
    matchId: string;
    homeGoals: number;
    awayGoals: number;
    affectedGuesses: number;
    pointsByRule: Record<string, { count: number; points: number }>;
    totalPointsAwarded: number;
    overwritesPrior: boolean;
    noChange: boolean;
  };
}

interface RegisterApplied {
  applied: true;
  matchId: string;
  scored: number;
  totalPointsAwarded: number;
  noChange: boolean;
}

type DraftMap = Record<string, { homeGoals: number; awayGoals: number }>;

const RULE_LABEL: Record<string, string> = {
  EXACT_SCORE: 'Placar exato (+10)',
  WINNER_AND_ONE_GOAL: 'Vencedor + 1 gol (+8)',
  WINNER_ONLY: 'Vencedor (+6)',
  DRAW_RESULT_WRONG_SCORE: 'Empate plac. errado (+4)',
  ONE_GOAL_ONLY: '1 gol acertado (+2)',
  MISS: 'Errou (0)',
};

const BRT_FORMATTER = new Intl.DateTimeFormat('pt-BR', {
  weekday: 'short',
  day: '2-digit',
  month: 'short',
  hour: '2-digit',
  minute: '2-digit',
  timeZone: 'America/Sao_Paulo',
});

export function AdminMatches() {
  const qc = useQueryClient();
  const [activeRound, setActiveRound] = useState<1 | 2 | 3 | 'today'>(1);
  const [draft, setDraft] = useState<DraftMap>({});
  const [preview, setPreview] = useState<{ match: MatchDto; data: RegisterPreview['preview'] } | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [toast, setToast] = useState<string | null>(null);

  const matchesQuery = useQuery({
    queryKey: ['matches', 'group-stage'],
    queryFn: () => api<MatchDto[]>('/matches/group-stage'),
  });

  const previewMutation = useMutation({
    mutationFn: async (input: { matchId: string; homeGoals: number; awayGoals: number }) => {
      const res = await api<RegisterPreview | RegisterApplied>(
        `/admin/matches/${input.matchId}/result`,
        {
          method: 'PUT',
          body: JSON.stringify({
            homeGoals: input.homeGoals,
            awayGoals: input.awayGoals,
          }),
        },
      );
      if ('applied' in res && res.applied === false) return res;
      throw new Error('Backend did not return a preview');
    },
    onError: (e: unknown) => {
      setError(e instanceof ApiError ? e.message : (e as Error).message);
    },
  });

  const confirmMutation = useMutation({
    mutationFn: (input: { matchId: string; homeGoals: number; awayGoals: number }) =>
      api<RegisterApplied>(`/admin/matches/${input.matchId}/result`, {
        method: 'PUT',
        body: JSON.stringify({
          homeGoals: input.homeGoals,
          awayGoals: input.awayGoals,
          confirmPreview: true,
        }),
      }),
    onSuccess: (data, variables) => {
      setToast(
        data.noChange
          ? 'Resultado já era o registrado — nenhuma mudança.'
          : `✅ Registrado · ${data.scored} palpites pontuados · ${data.totalPointsAwarded} pts totais.`,
      );
      setPreview(null);
      setDraft((prev) => {
        const next = { ...prev };
        delete next[variables.matchId];
        return next;
      });
      qc.invalidateQueries({ queryKey: ['matches', 'group-stage'] });
      qc.invalidateQueries({ queryKey: ['ranking'] });
      qc.invalidateQueries({ queryKey: ['prizes'] });
      setTimeout(() => setToast(null), 4_000);
    },
    onError: (e: unknown) => {
      setError(e instanceof ApiError ? e.message : (e as Error).message);
    },
  });

  function update(matchId: string, homeGoals: number, awayGoals: number) {
    setDraft((prev) => ({ ...prev, [matchId]: { homeGoals, awayGoals } }));
  }

  async function requestPreview(m: MatchDto) {
    const d = draft[m.id];
    if (!d) return;
    setError(null);
    const data = await previewMutation.mutateAsync({
      matchId: m.id,
      homeGoals: d.homeGoals,
      awayGoals: d.awayGoals,
    });
    setPreview({ match: m, data: data.preview });
  }

  const byRound = useMemo(() => {
    const acc: Record<1 | 2 | 3, MatchDto[]> = { 1: [], 2: [], 3: [] };
    for (const m of matchesQuery.data ?? []) {
      const r = (m.roundNumber as 1 | 2 | 3 | null) ?? 1;
      acc[r].push(m);
    }
    return acc;
  }, [matchesQuery.data]);

  if (matchesQuery.isLoading) {
    return <p className="text-emerald-200/70">Carregando jogos...</p>;
  }
  if (matchesQuery.error) {
    return (
      <div className="card-glow text-red-200">
        <p>{(matchesQuery.error as Error).message}</p>
      </div>
    );
  }

  const todayMatches = (matchesQuery.data ?? []).filter(
    (m) => brtDate(m.kickoffAt) === brtDate(new Date().toISOString()),
  );
  const matches = activeRound === 'today' ? todayMatches : byRound[activeRound];
  const registeredInRound = matches.filter((m) => m.homeGoalsOfficial !== null).length;

  return (
    <div className="space-y-6">
      <header>
        <p className="text-xs font-bold tracking-[0.4em] text-gold-400">ADMIN</p>
        <h1 className="font-display text-3xl tracking-wider text-white mt-1">
          <span className="text-shimmer">RESULTADOS</span>
        </h1>
        <p className="text-sm text-emerald-200/70 mt-2">
          Registre o placar oficial de cada jogo. Antes de aplicar, veja o impacto:
          quantos palpites são pontuados e como.
        </p>
      </header>

      {toast && (
        <div className="card border-emerald-400/40 bg-emerald-500/10 text-emerald-100 text-sm">
          {toast}
        </div>
      )}
      {error && (
        <div className="card border-red-400/40 bg-red-500/10 text-red-200 text-sm flex items-center justify-between gap-3">
          <span>{error}</span>
          <button onClick={() => setError(null)} className="text-xs text-red-100/70 hover:text-red-100">
            fechar
          </button>
        </div>
      )}

      <div className="flex gap-2 border-b border-emerald-500/20 overflow-x-auto">
        {([1, 2, 3] as const).map((r) => (
          <button
            key={r}
            onClick={() => setActiveRound(r)}
            className={
              'px-4 py-2 text-sm font-semibold border-b-2 transition whitespace-nowrap ' +
              (activeRound === r
                ? 'border-gold-400 text-gold-200'
                : 'border-transparent text-emerald-200/60 hover:text-emerald-100')
            }
          >
            Rodada {r}
            <span className="ml-1.5 text-xs text-emerald-300/50">
              ({byRound[r].filter((m) => m.homeGoalsOfficial !== null).length}/{byRound[r].length})
            </span>
          </button>
        ))}
        <button
          onClick={() => setActiveRound('today')}
          className={
            'px-4 py-2 text-sm font-semibold border-b-2 transition whitespace-nowrap ' +
            (activeRound === 'today'
              ? 'border-gold-400 text-gold-200'
              : 'border-transparent text-emerald-200/60 hover:text-emerald-100')
          }
        >
          📅 Jogos do dia
          <span className="ml-1.5 text-xs text-emerald-300/50">({todayMatches.length})</span>
        </button>
      </div>

      <p className="text-xs text-emerald-300/70">
        {registeredInRound} de {matches.length} jogos registrados nesta rodada.
      </p>

      <div className="space-y-2">
        {matches.length === 0 && (
          <p className="text-sm text-emerald-200/60 py-6 text-center">
            {activeRound === 'today' ? 'Nenhum jogo hoje. 📅' : 'Nenhum jogo nesta rodada.'}
          </p>
        )}
        {matches.map((m) => (
          <div key={m.id} className="space-y-2">
            <MatchRow
              match={m}
              draft={draft[m.id]}
              onChange={(home, away) => update(m.id, home, away)}
              onPreview={() => requestPreview(m)}
              previewLoading={previewMutation.isPending}
            />
            {activeRound === 'today' && (
              <TodayMatchExtras
                match={m}
                onCopied={() => {
                  setToast('📋 Copiado pro WhatsApp!');
                  setTimeout(() => setToast(null), 2500);
                }}
              />
            )}
          </div>
        ))}
      </div>

      {typeof activeRound === 'number' && activeRound < 3 && (
        <div className="flex items-center justify-between gap-3 pt-2 border-t border-emerald-500/15">
          <p className="text-xs text-emerald-300/60">
            {registeredInRound === matches.length
              ? '✅ Rodada completa!'
              : `${matches.length - registeredInRound} jogo(s) sem resultado nesta rodada.`}
          </p>
          <button
            className="btn-gold text-sm"
            onClick={() => {
              setActiveRound((activeRound + 1) as 1 | 2 | 3);
              window.scrollTo({ top: 0, behavior: 'smooth' });
            }}
          >
            Ir para a Rodada {activeRound + 1} →
          </button>
        </div>
      )}

      {preview && (
        <PreviewModal
          match={preview.match}
          preview={preview.data}
          onClose={() => setPreview(null)}
          onConfirm={() =>
            confirmMutation.mutate({
              matchId: preview.match.id,
              homeGoals: preview.data.homeGoals,
              awayGoals: preview.data.awayGoals,
            })
          }
          confirming={confirmMutation.isPending}
        />
      )}
    </div>
  );
}

interface RowProps {
  match: MatchDto;
  draft?: { homeGoals: number; awayGoals: number };
  onChange: (home: number, away: number) => void;
  onPreview: () => void;
  previewLoading: boolean;
}

function MatchRow({ match, draft, onChange, onPreview, previewLoading }: RowProps) {
  const isRegistered = match.homeGoalsOfficial !== null;
  const homeFlag = flagUrl(match.homeTeamCode);
  const awayFlag = flagUrl(match.awayTeamCode);

  const homeVal = draft?.homeGoals ?? match.homeGoalsOfficial ?? '';
  const awayVal = draft?.awayGoals ?? match.awayGoalsOfficial ?? '';

  function clamp(v: string): number {
    const n = Number.parseInt(v, 10);
    if (Number.isNaN(n)) return 0;
    return Math.max(0, Math.min(15, n));
  }

  return (
    <div
      className={
        'rounded-xl border px-3 py-3 grid grid-cols-[auto,1fr,auto,1fr,auto] items-center gap-3 ' +
        (isRegistered
          ? 'border-emerald-500/25 bg-emerald-900/15'
          : 'border-emerald-500/15 bg-midnight-900/40')
      }
    >
      <div className="text-[11px] text-emerald-300/70 min-w-[120px]">
        <p className="font-semibold text-emerald-200/80">{kickoffLabel(match.kickoffAt)}</p>
        <p className="text-emerald-200/50">Grupo {match.groupLetter} · R{match.roundNumber}</p>
      </div>

      <div className="flex items-center justify-end gap-2 min-w-0">
        <span className="text-sm text-emerald-50 truncate">
          {match.homeTeamName ?? match.homeTeamCode}
        </span>
        {homeFlag && (
          <img src={homeFlag} alt="" loading="lazy" className="w-7 h-5 object-cover rounded-sm ring-1 ring-black/20" />
        )}
      </div>

      <div className="flex items-center gap-2">
        <input
          inputMode="numeric"
          pattern="[0-9]*"
          min={0}
          max={15}
          value={homeVal}
          onChange={(e) => onChange(clamp(e.target.value), draft?.awayGoals ?? (Number(awayVal) || 0))}
          className="w-12 rounded-lg border border-emerald-500/30 bg-midnight-800 px-2 py-1.5 text-center font-display text-lg text-white outline-none focus:border-gold-400/70 focus:ring-2 focus:ring-gold-400/30"
          aria-label="Gols mandante"
        />
        <span className="text-emerald-300/40 font-bold">×</span>
        <input
          inputMode="numeric"
          pattern="[0-9]*"
          min={0}
          max={15}
          value={awayVal}
          onChange={(e) => onChange(draft?.homeGoals ?? (Number(homeVal) || 0), clamp(e.target.value))}
          className="w-12 rounded-lg border border-emerald-500/30 bg-midnight-800 px-2 py-1.5 text-center font-display text-lg text-white outline-none focus:border-gold-400/70 focus:ring-2 focus:ring-gold-400/30"
          aria-label="Gols visitante"
        />
      </div>

      <div className="flex items-center gap-2 min-w-0">
        {awayFlag && (
          <img src={awayFlag} alt="" loading="lazy" className="w-7 h-5 object-cover rounded-sm ring-1 ring-black/20" />
        )}
        <span className="text-sm text-emerald-50 truncate">
          {match.awayTeamName ?? match.awayTeamCode}
        </span>
      </div>

      <div>
        {isRegistered && !draft ? (
          <span className="chip text-[10px]">✓ Registrado</span>
        ) : (
          <button
            className="btn-secondary text-xs whitespace-nowrap"
            onClick={onPreview}
            disabled={!draft || previewLoading}
            title={!draft ? 'Edite o placar para visualizar' : 'Visualizar impacto'}
          >
            {previewLoading ? '...' : 'Pré-visualizar'}
          </button>
        )}
      </div>
    </div>
  );
}

interface ModalProps {
  match: MatchDto;
  preview: RegisterPreview['preview'];
  onClose: () => void;
  onConfirm: () => void;
  confirming: boolean;
}

function PreviewModal({ match, preview, onClose, onConfirm, confirming }: ModalProps) {
  const rules = Object.entries(preview.pointsByRule).sort((a, b) => b[1].points - a[1].points);

  return (
    <div className="fixed inset-0 z-40 grid place-items-center bg-black/70 p-4" onClick={onClose}>
      <div className="card-glow max-w-lg w-full" onClick={(e) => e.stopPropagation()}>
        <h3 className="font-display text-2xl text-white tracking-wider mb-1">
          PRÉ-VISUALIZAR IMPACTO
        </h3>
        <p className="text-sm text-emerald-200/70 mb-4">
          {match.homeTeamCode} <strong className="text-gold-300">{preview.homeGoals}</strong>
          {' × '}
          <strong className="text-gold-300">{preview.awayGoals}</strong> {match.awayTeamCode}
        </p>

        {preview.noChange && (
          <p className="text-sm text-amber-200 bg-amber-500/10 border border-amber-500/30 rounded-xl p-3 mb-4">
            ⚠️ Esse placar já era o registrado. Confirmar é um no-op.
          </p>
        )}

        <div className="grid grid-cols-2 gap-3 mb-4">
          <div className="rounded-lg border border-emerald-500/15 bg-midnight-900/40 px-3 py-2">
            <p className="text-[10px] tracking-widest text-emerald-300/60">PALPITES AFETADOS</p>
            <p className="font-display text-2xl text-white">{preview.affectedGuesses}</p>
          </div>
          <div className="rounded-lg border border-gold-400/30 bg-gold-400/10 px-3 py-2">
            <p className="text-[10px] tracking-widest text-gold-300/80">PONTOS A ENTREGAR</p>
            <p className="font-display text-2xl text-gold-100">{preview.totalPointsAwarded}</p>
          </div>
        </div>

        {rules.length > 0 && (
          <div className="mb-4">
            <p className="text-[10px] tracking-widest text-emerald-300/60 mb-2">DETALHAMENTO POR REGRA</p>
            <ul className="space-y-1">
              {rules.map(([rule, info]) => (
                <li
                  key={rule}
                  className="flex items-center justify-between text-xs border-b border-emerald-500/10 py-1"
                >
                  <span className="text-emerald-100/85">{RULE_LABEL[rule] ?? rule}</span>
                  <span className="text-emerald-200/70">
                    {info.count} palpites · {info.points} pts
                  </span>
                </li>
              ))}
            </ul>
          </div>
        )}

        <div className="flex justify-end gap-2">
          <button className="btn-secondary text-sm" onClick={onClose}>
            Cancelar
          </button>
          <button
            className="btn-gold text-sm"
            onClick={onConfirm}
            disabled={confirming}
          >
            {confirming ? 'Aplicando...' : 'Confirmar e registrar'}
          </button>
        </div>
      </div>
    </div>
  );
}

function kickoffLabel(iso: string): string {
  try {
    return BRT_FORMATTER.format(new Date(iso));
  } catch {
    return iso;
  }
}

/** YYYY-MM-DD na timezone de São Paulo (pra comparar "é hoje?"). */
function brtDate(iso: string): string {
  return new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Sao_Paulo' }).format(new Date(iso));
}

type Distribution = Array<{ homeGoals: number; awayGoals: number; count: number }>;

function TodayMatchExtras({ match, onCopied }: { match: MatchDto; onCopied: () => void }) {
  const { data } = useQuery({
    queryKey: ['guess-distribution', match.id],
    queryFn: () => api<Distribution>(`/admin/matches/${match.id}/guess-distribution`),
  });
  if (!data) return null;
  const top = data.slice(0, 5);
  const total = data.reduce((s, d) => s + d.count, 0);

  function copy() {
    const home = match.homeTeamName ?? match.homeTeamCode ?? '';
    const away = match.awayTeamName ?? match.awayTeamCode ?? '';
    const lines = top.map(
      (d, i) => `${i + 1}. ${d.homeGoals}x${d.awayGoals} — ${d.count} palpite${d.count !== 1 ? 's' : ''}`,
    );
    const text = `⚽ ${home} x ${away}\nPalpites mais jogados:\n${lines.join('\n')}`;
    navigator.clipboard?.writeText(text).then(onCopied).catch(() => undefined);
  }

  return (
    <div className="rounded-xl border border-emerald-500/10 bg-midnight-900/30 px-3 py-2">
      <div className="flex items-center justify-between gap-2 mb-1">
        <p className="text-[10px] tracking-widest text-emerald-300/60">
          PALPITES MAIS JOGADOS{total > 0 ? ` (${total})` : ''}
        </p>
        {top.length > 0 && (
          <button onClick={copy} className="btn-secondary text-[11px] py-1">
            📋 Copiar p/ WhatsApp
          </button>
        )}
      </div>
      {top.length === 0 ? (
        <p className="text-xs text-emerald-200/50">Ninguém palpitou esse jogo ainda.</p>
      ) : (
        <ul className="flex flex-wrap gap-2">
          {top.map((d) => (
            <li key={`${d.homeGoals}-${d.awayGoals}`} className="chip text-[11px]">
              {d.homeGoals}×{d.awayGoals} <span className="text-emerald-300/60">· {d.count}</span>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
