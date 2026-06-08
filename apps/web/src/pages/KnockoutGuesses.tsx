import { useEffect, useMemo, useRef, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { api, ApiError } from '../lib/api';
import { flagUrl } from '../lib/flags';
import type {
  BracketFixtureDto,
  KnockoutFixtureScoreDto,
  KnockoutOfficialResultDto,
  KnockoutScoreEntryDto,
  KnockoutStage,
  MyKnockoutGuessesDto,
} from '@bolao/shared';

type DraftMap = Record<string, KnockoutScoreEntryDto>;

const STAGE_ORDER: KnockoutStage[] = ['r32', 'r16', 'qf', 'sf', 'tp', 'final'];

const STAGE_LABEL: Record<KnockoutStage, string> = {
  r32: 'Rodada de 32 (16 jogos)',
  r16: 'Oitavas (8 jogos)',
  qf: 'Quartas (4 jogos)',
  sf: 'Semifinais (2 jogos)',
  tp: 'Disputa de 3º lugar',
  final: 'Final',
};

function useCountdown(targetIso: string | undefined): string {
  const [now, setNow] = useState(Date.now());
  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), 1_000);
    return () => clearInterval(id);
  }, []);
  if (!targetIso) return '—';
  const diff = new Date(targetIso).getTime() - now;
  if (diff <= 0) return 'expirado';
  const d = Math.floor(diff / 86_400_000);
  const h = Math.floor((diff % 86_400_000) / 3_600_000);
  const m = Math.floor((diff % 3_600_000) / 60_000);
  return d > 0 ? `${d}d ${h}h ${m}m` : `${h}h ${m}m`;
}

export function KnockoutGuesses() {
  const navigate = useNavigate();
  const qc = useQueryClient();
  const [draft, setDraft] = useState<DraftMap>({});
  const [seeded, setSeeded] = useState(false);
  const [lastSavedAt, setLastSavedAt] = useState<Date | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [showConfirm, setShowConfirm] = useState(false);

  const knockoutQuery = useQuery({
    queryKey: ['knockout-guesses'],
    queryFn: () => api<MyKnockoutGuessesDto>('/guesses/knockout'),
  });

  useEffect(() => {
    if (knockoutQuery.data && !seeded) {
      setDraft(knockoutQuery.data.scores ?? {});
      setSeeded(true);
    }
  }, [knockoutQuery.data, seeded]);

  const saveMutation = useMutation({
    mutationFn: (payload: DraftMap) =>
      api('/guesses/knockout-scores', {
        method: 'PUT',
        body: JSON.stringify({
          scores: Object.entries(payload).map(([fixtureId, s]) => ({
            fixtureId,
            homeGoals: s.homeGoals,
            awayGoals: s.awayGoals,
            advancesTeamCode: s.advancesTeamCode ?? null,
          })),
        }),
      }),
    onSuccess: () => {
      setLastSavedAt(new Date());
      // Refetch so downstream R16+ slots reflect the updated propagation.
      qc.invalidateQueries({ queryKey: ['knockout-guesses'] });
      qc.invalidateQueries({ queryKey: ['bracket-preview'] });
    },
    onError: (e: unknown) => {
      setError(e instanceof ApiError ? e.message : 'Falha ao salvar rascunho');
    },
  });

  const submitMutation = useMutation({
    mutationFn: () => api('/guesses/knockout-submit', { method: 'POST' }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['knockout-guesses'] });
      setShowConfirm(false);
      navigate('/bracket');
    },
    onError: (e: unknown) => {
      setError(e instanceof ApiError ? e.message : 'Falha ao submeter palpites finais');
    },
  });

  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const draftRef = useRef(draft);
  draftRef.current = draft;

  function scheduleSave() {
    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => {
      if (Object.keys(draftRef.current).length === 0) return;
      saveMutation.mutate(draftRef.current);
    }, 700);
  }

  function updateScore(fixture: BracketFixtureDto, homeGoals: number, awayGoals: number) {
    setDraft((prev) => {
      const existing = prev[fixture.id];
      const isDraw = homeGoals === awayGoals;
      // Auto-clear advancesTeamCode if no longer a draw, or if it points to a
      // team that isn't on this fixture anymore.
      let advancesTeamCode = existing?.advancesTeamCode ?? null;
      if (!isDraw) advancesTeamCode = null;
      else if (
        advancesTeamCode &&
        advancesTeamCode !== fixture.topTeamCode &&
        advancesTeamCode !== fixture.bottomTeamCode
      ) {
        advancesTeamCode = null;
      }
      return { ...prev, [fixture.id]: { homeGoals, awayGoals, advancesTeamCode } };
    });
    scheduleSave();
  }

  function updateAdvances(fixtureId: string, advancesTeamCode: string) {
    setDraft((prev) => {
      const existing = prev[fixtureId];
      if (!existing) return prev;
      return {
        ...prev,
        [fixtureId]: { ...existing, advancesTeamCode },
      };
    });
    scheduleSave();
  }

  useEffect(() => () => {
    if (debounceRef.current) clearTimeout(debounceRef.current);
  }, []);

  const data = knockoutQuery.data;
  const locksIn = useCountdown(data?.locksAt);

  const fixturesByStage = useMemo(() => {
    const acc: Record<KnockoutStage, BracketFixtureDto[]> = {
      r32: [], r16: [], qf: [], sf: [], tp: [], final: [],
    };
    for (const f of data?.fixtures ?? []) acc[f.stage].push(f);
    return acc;
  }, [data?.fixtures]);

  if (knockoutQuery.isLoading) {
    return <p className="text-emerald-200/70">Carregando palpites de mata-mata...</p>;
  }
  if (knockoutQuery.error) {
    const err = knockoutQuery.error as Error;
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

  if (!data?.groupSubmitted) {
    return (
      <div className="card-glow space-y-4">
        <h1 className="font-display text-3xl tracking-wider text-white">
          <span className="text-shimmer">MATA-MATA</span>
        </h1>
        <p className="text-sm text-emerald-100/80">
          Para palpitar nos placares do mata-mata, primeiro você precisa submeter os 72 placares
          da fase de grupos. É a partir deles que o chaveamento é construído.
        </p>
        <Link to="/guesses" className="btn-gold inline-block text-sm">
          Ir para palpites de grupo →
        </Link>
      </div>
    );
  }

  const filledCount = Object.keys(draft).length;
  const alreadySubmitted = Boolean(data.submittedAt);
  // Travado = janela fechada (deadline) OU já submetido (finalizado, imutável).
  const locked = !data.isOpen || alreadySubmitted;
  const drawsMissingAdvances = Object.entries(draft).filter(
    ([, s]) => s.homeGoals === s.awayGoals && !s.advancesTeamCode,
  ).length;

  return (
    <div className="space-y-8 pb-40">
      <header className="flex items-end justify-between flex-wrap gap-3">
        <div>
          <p className="text-xs font-bold tracking-[0.4em] text-gold-400">FASE DE MATA-MATA</p>
          <h1 className="font-display text-4xl tracking-wider text-white mt-1">
            <span className="text-shimmer">PALPITES KO</span>
          </h1>
          <p className="text-sm text-emerald-200/70 mt-2 max-w-xl">
            Os times de cada slot vêm do <Link to="/bracket" className="link-accent">seu
            chaveamento</Link>. Ao palpitar num jogo, o vencedor avança automaticamente para a
            próxima rodada. Em caso de empate, escolha quem passa.
            Acerte cada slot e ganhe <span className="text-gold-300">15 pts</span>;
            os 2 times + placar exato = até <span className="text-gold-300">40 pts</span>.
          </p>
        </div>
        <div className="text-right">
          <p className="text-xs text-emerald-300/70">
            {filledCount}/32 jogos preenchidos
          </p>
          <p className="text-[11px] text-emerald-200/50 mt-1">
            Trava em <span className="text-gold-300 font-semibold">{locksIn}</span>
          </p>
          {drawsMissingAdvances > 0 && (
            <p className="text-[11px] text-amber-300 mt-1">
              ⚠️ {drawsMissingAdvances} empate(s) sem "quem passa"
            </p>
          )}
          {alreadySubmitted && (
            <p className="text-[11px] text-gold-300 mt-1">✓ Submetido</p>
          )}
          {lastSavedAt && (
            <p className="text-[11px] text-emerald-200/50">
              Rascunho salvo às {lastSavedAt.toLocaleTimeString('pt-BR')}
            </p>
          )}
        </div>
      </header>

      {error && (
        <div className="card text-red-200 border-red-400/40 bg-red-500/10">
          <div className="flex items-center justify-between gap-3">
            <p className="text-sm">{error}</p>
            <button
              onClick={() => setError(null)}
              className="text-xs text-red-100/70 hover:text-red-100"
            >
              fechar
            </button>
          </div>
        </div>
      )}

      {STAGE_ORDER.map((stage) => {
        const fixtures = fixturesByStage[stage];
        if (fixtures.length === 0) return null;
        return (
          <section key={stage} className="space-y-3">
            <h2 className="font-display text-xl tracking-wider text-emerald-100/80">
              {STAGE_LABEL[stage].toUpperCase()}
            </h2>
            <div className="grid gap-3 sm:grid-cols-2">
              {fixtures.map((f) => (
                <KnockoutFixtureCard
                  key={f.id}
                  fixture={f}
                  guess={draft[f.id]}
                  score={data.points?.[f.id]}
                  official={data.officialResults?.[f.id]}
                  readOnly={locked}
                  onChange={(home, away) => updateScore(f, home, away)}
                  onAdvancesChange={(code) => updateAdvances(f.id, code)}
                />
              ))}
            </div>
          </section>
        );
      })}

      <div className="fixed bottom-0 inset-x-0 z-20 border-t border-emerald-500/20 bg-midnight-900/90 backdrop-blur-md">
        <div className="max-w-6xl mx-auto px-4 py-3 flex items-center justify-between gap-3">
          <div className="text-xs text-emerald-200/70">
            {alreadySubmitted
              ? '🔒 Mata-mata finalizado — seus palpites não podem mais ser alterados'
              : !data.isOpen
                ? '🔒 Janela fechada — palpites de mata-mata travados'
                : `${filledCount}/32 preenchidos · trava em ${locksIn}`}
          </div>
          <div className="flex items-center gap-2">
            <Link to="/bracket" className="btn-secondary text-sm">
              Ver chaveamento
            </Link>
            {!alreadySubmitted && (
              <button
                className="btn-gold text-sm"
                disabled={
                  locked ||
                  filledCount === 0 ||
                  drawsMissingAdvances > 0 ||
                  submitMutation.isPending
                }
                onClick={() => setShowConfirm(true)}
              >
                {submitMutation.isPending ? 'Enviando...' : 'Submeter palpites de KO →'}
              </button>
            )}
          </div>
        </div>
      </div>

      {showConfirm && (
        <div
          className="fixed inset-0 z-40 grid place-items-center bg-black/70 p-4"
          onClick={() => setShowConfirm(false)}
        >
          <div
            className="card-glow max-w-md w-full"
            onClick={(e) => e.stopPropagation()}
          >
            <h3 className="font-display text-2xl text-white tracking-wider mb-3">
              SUBMETER MATA-MATA
            </h3>
            <p className="text-sm text-emerald-100/85 mb-4">
              Você vai submeter <strong>{filledCount}</strong> palpites de placar de mata-mata.
              <strong className="text-gold-200"> Atenção:</strong> depois de confirmar, os palpites
              do mata-mata <strong>não poderão mais ser alterados</strong>.
            </p>
            <div className="flex justify-end gap-2">
              <button className="btn-secondary text-sm" onClick={() => setShowConfirm(false)}>
                Cancelar
              </button>
              <button
                className="btn-gold text-sm"
                disabled={submitMutation.isPending}
                onClick={() => submitMutation.mutate()}
              >
                {submitMutation.isPending ? 'Enviando...' : 'Confirmar submissão'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

interface CardProps {
  fixture: BracketFixtureDto;
  guess?: KnockoutScoreEntryDto;
  score?: KnockoutFixtureScoreDto;
  official?: KnockoutOfficialResultDto;
  onChange?: (homeGoals: number, awayGoals: number) => void;
  onAdvancesChange?: (advancesTeamCode: string) => void;
  readOnly?: boolean;
}

function KnockoutFixtureCard({
  fixture,
  guess,
  score,
  official,
  onChange,
  onAdvancesChange,
  readOnly,
}: CardProps) {
  const home = guess?.homeGoals ?? '';
  const away = guess?.awayGoals ?? '';

  function clamp(v: string): number {
    const n = Number.parseInt(v, 10);
    if (Number.isNaN(n)) return 0;
    return Math.max(0, Math.min(15, n));
  }

  const topFlag = flagUrl(fixture.topTeamCode);
  const bottomFlag = flagUrl(fixture.bottomTeamCode);
  const bothResolved = Boolean(fixture.topTeamCode && fixture.bottomTeamCode);
  const isDraw = guess !== undefined && guess.homeGoals === guess.awayGoals;
  const drawIncomplete = isDraw && bothResolved && !guess?.advancesTeamCode;
  const winner = fixture.predictedWinnerCode;

  return (
    <div
      className={
        'rounded-xl border bg-midnight-900/40 px-3 py-3 flex flex-col gap-2 ' +
        (drawIncomplete ? 'border-amber-400/50' : 'border-emerald-500/15')
      }
    >
      <div className="flex items-center justify-between text-[10px] tracking-[0.3em] text-gold-300/70">
        <span>{fixture.id}</span>
        {!bothResolved ? (
          <span className="text-amber-200/70 normal-case tracking-normal text-[11px]">
            aguardando bracket
          </span>
        ) : winner ? (
          <span className="text-emerald-300/80 normal-case tracking-normal text-[11px]">
            avança: <strong className="text-gold-200">{winner}</strong>
          </span>
        ) : null}
      </div>
      <div className="grid grid-cols-[1fr,auto,1fr] items-center gap-3">
        <div className="flex items-center justify-end gap-2 min-w-0">
          <div className="text-right min-w-0">
            <p className="text-sm font-semibold text-emerald-50 truncate">
              {fixture.topTeamCode ?? '—'}
            </p>
            <p className="text-[10px] tracking-widest text-emerald-300/60">
              {topSlotLabel(fixture)}
            </p>
          </div>
          {topFlag ? (
            <img
              src={topFlag}
              alt=""
              loading="lazy"
              className="w-7 h-5 object-cover rounded-sm ring-1 ring-black/20 shrink-0"
            />
          ) : (
            <div className="w-7 h-5 rounded-sm bg-emerald-500/15 shrink-0" />
          )}
        </div>
        <div className="flex items-center gap-2">
          <input
            inputMode="numeric"
            pattern="[0-9]*"
            min={0}
            max={15}
            value={home}
            disabled={readOnly || !bothResolved}
            onChange={(e) => onChange?.(clamp(e.target.value), guess?.awayGoals ?? 0)}
            className="w-14 h-12 rounded-lg border border-emerald-500/30 bg-midnight-800 px-2 text-center font-display text-xl text-white outline-none focus:border-gold-400/70 focus:ring-2 focus:ring-gold-400/30 disabled:opacity-50"
            aria-label="Gols do mandante"
          />
          <span className="text-emerald-300/40 font-bold">×</span>
          <input
            inputMode="numeric"
            pattern="[0-9]*"
            min={0}
            max={15}
            value={away}
            disabled={readOnly || !bothResolved}
            onChange={(e) => onChange?.(guess?.homeGoals ?? 0, clamp(e.target.value))}
            className="w-14 h-12 rounded-lg border border-emerald-500/30 bg-midnight-800 px-2 text-center font-display text-xl text-white outline-none focus:border-gold-400/70 focus:ring-2 focus:ring-gold-400/30 disabled:opacity-50"
            aria-label="Gols do visitante"
          />
        </div>
        <div className="flex items-center gap-2 min-w-0">
          {bottomFlag ? (
            <img
              src={bottomFlag}
              alt=""
              loading="lazy"
              className="w-7 h-5 object-cover rounded-sm ring-1 ring-black/20 shrink-0"
            />
          ) : (
            <div className="w-7 h-5 rounded-sm bg-emerald-500/15 shrink-0" />
          )}
          <div className="text-left min-w-0">
            <p className="text-sm font-semibold text-emerald-50 truncate">
              {fixture.bottomTeamCode ?? '—'}
            </p>
            <p className="text-[10px] tracking-widest text-emerald-300/60">
              {bottomSlotLabel(fixture)}
            </p>
          </div>
        </div>
      </div>

      {guess !== undefined && guess.homeGoals === guess.awayGoals && bothResolved && (
        <div
          className={
            'rounded-lg border px-3 py-2 text-xs ' +
            (guess.advancesTeamCode
              ? 'border-emerald-500/25 bg-emerald-900/15 text-emerald-100/85'
              : 'border-amber-400/40 bg-amber-500/10 text-amber-100')
          }
        >
          <p className="text-[10px] tracking-[0.3em] mb-1">EMPATE — QUEM AVANÇA?</p>
          <div className="flex gap-2">
            {([fixture.topTeamCode, fixture.bottomTeamCode] as const).map(
              (code) =>
                code && (
                  <button
                    key={code}
                    type="button"
                    disabled={readOnly}
                    onClick={() => onAdvancesChange?.(code)}
                    className={
                      'flex-1 rounded-md border px-2 py-1.5 font-semibold transition ' +
                      (guess.advancesTeamCode === code
                        ? 'border-gold-400 bg-gold-400/15 text-gold-100'
                        : 'border-emerald-500/30 hover:border-emerald-400/60 text-emerald-100/90')
                    }
                  >
                    {code}
                  </button>
                ),
            )}
          </div>
        </div>
      )}

      {official && (
        <div className="mt-1 border-t border-emerald-500/15 pt-2 flex flex-wrap items-center justify-between gap-x-3 gap-y-1">
          <span className="text-[11px] uppercase tracking-wider text-emerald-300/60">
            Resultado final
          </span>
          <div className="flex items-center gap-2 flex-wrap">
            {/* Times REAIS que jogaram (podem diferir do palpite). */}
            <span className="flex items-center gap-1.5 text-sm text-white">
              <MiniFlag code={official.homeTeamCode} />
              <span className="font-semibold">{official.homeTeamCode ?? '—'}</span>
              <span className="font-display">
                {official.homeGoals} <span className="text-emerald-300/40">×</span>{' '}
                {official.awayGoals}
              </span>
              <span className="font-semibold">{official.awayTeamCode ?? '—'}</span>
              <MiniFlag code={official.awayTeamCode} />
            </span>
            {official.advancesTeamCode && (
              <span className="text-[10px] text-emerald-300/60">
                avançou {official.advancesTeamCode}
              </span>
            )}
            {score && (
              <span
                className={
                  'inline-flex items-center rounded-full px-2 py-0.5 text-xs font-bold ' +
                  (score.points > 0
                    ? 'bg-gold-400/15 text-gold-200 border border-gold-400/30'
                    : 'bg-midnight-800 text-emerald-200/60 border border-emerald-500/20')
                }
                title={`${score.teamPoints} pts de times + ${score.scorePoints} de placar`}
              >
                +{score.points} pts
              </span>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

function MiniFlag({ code }: { code: string | null }) {
  const url = flagUrl(code);
  if (!url) return null;
  return (
    <img
      src={url}
      alt=""
      loading="lazy"
      className="w-5 h-3.5 object-cover rounded-[2px] ring-1 ring-black/20 shrink-0"
    />
  );
}

function topSlotLabel(f: BracketFixtureDto): string {
  return slotLabel(f.topSlot);
}
function bottomSlotLabel(f: BracketFixtureDto): string {
  return slotLabel(f.bottomSlot);
}
function slotLabel(s: BracketFixtureDto['topSlot']): string {
  switch (s.kind) {
    case 'WINNER_GROUP':
      return `1º ${s.group}`;
    case 'RUNNER_UP_GROUP':
      return `2º ${s.group}`;
    case 'BEST_THIRD_FROM':
      return `3º (${s.allowedGroups.join(',')})`;
    case 'WINNER_OF':
      return `Vencedor ${s.fixtureId}`;
    case 'LOSER_OF':
      return `Perdedor ${s.fixtureId}`;
  }
}
