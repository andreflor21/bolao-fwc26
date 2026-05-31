import { useEffect, useMemo, useRef, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { api, ApiError } from '../lib/api';
import { MatchCard } from '../components/MatchCard';
import type {
  GroupLetter,
  MatchDto,
  MyGuessesDto,
} from '@bolao/shared';

type DraftMap = Record<string, { homeGoals: number; awayGoals: number }>;

const GROUP_LETTERS: GroupLetter[] = [
  'A', 'B', 'C', 'D', 'E', 'F', 'G', 'H', 'I', 'J', 'K', 'L',
];

export function Guesses() {
  const navigate = useNavigate();
  const qc = useQueryClient();
  const [draft, setDraft] = useState<DraftMap>({});
  const [activeRound, setActiveRound] = useState<1 | 2 | 3>(1);
  const [showConfirm, setShowConfirm] = useState(false);
  const [lastSavedAt, setLastSavedAt] = useState<Date | null>(null);
  const [error, setError] = useState<string | null>(null);

  const matchesQuery = useQuery({
    queryKey: ['matches', 'group-stage'],
    queryFn: () => api<MatchDto[]>('/matches/group-stage'),
    staleTime: 60_000 * 5,
  });

  const guessesQuery = useQuery({
    queryKey: ['guesses'],
    queryFn: () => api<MyGuessesDto>('/guesses'),
  });

  // Seed the draft from server data once both queries resolve.
  useEffect(() => {
    if (guessesQuery.data && Object.keys(draft).length === 0) {
      const initial: DraftMap = {};
      for (const [matchId, g] of Object.entries(guessesQuery.data.guesses)) {
        initial[matchId] = { homeGoals: g.homeGoals, awayGoals: g.awayGoals };
      }
      setDraft(initial);
    }
  }, [guessesQuery.data]); // eslint-disable-line react-hooks/exhaustive-deps

  const saveMutation = useMutation({
    mutationFn: (payload: DraftMap) =>
      api('/guesses/group-stage', {
        method: 'PUT',
        body: JSON.stringify({
          guesses: Object.entries(payload).map(([matchId, g]) => ({
            matchId,
            ...g,
          })),
        }),
      }),
    onSuccess: () => setLastSavedAt(new Date()),
    onError: (e: unknown) => {
      setError(
        e instanceof ApiError ? e.message : 'Falha ao salvar rascunho — verifique sua conexão.',
      );
    },
  });

  const submitMutation = useMutation({
    mutationFn: () => api<{ submittedAt: string }>('/guesses/submit', { method: 'POST' }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['guesses'] });
      qc.invalidateQueries({ queryKey: ['bracket-preview'] });
      setShowConfirm(false);
      navigate('/bracket');
    },
    onError: (e: unknown) => {
      setError(
        e instanceof ApiError ? e.message : 'Falha ao submeter palpites finais.',
      );
    },
  });

  // Debounced autosave — 2s after last change.
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const draftRef = useRef(draft);
  draftRef.current = draft;

  function updateGuess(matchId: string, homeGoals: number, awayGoals: number) {
    // Trava: depois de finalizado (ou após o lock da Copa) não edita mais.
    const d = guessesQuery.data;
    if (d && (!d.isOpen || d.submittedAt)) return;
    setDraft((prev) => ({ ...prev, [matchId]: { homeGoals, awayGoals } }));
    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => {
      const filled = Object.entries(draftRef.current).filter(
        ([, g]) => g !== undefined,
      );
      if (filled.length === 0) return;
      saveMutation.mutate(Object.fromEntries(filled));
    }, 2_000);
  }

  useEffect(() => () => {
    if (debounceRef.current) clearTimeout(debounceRef.current);
  }, []);

  function goToRound(r: 1 | 2 | 3) {
    setActiveRound(r);
    window.scrollTo({ top: 0, behavior: 'smooth' });
  }

  const matchesByRound = useMemo(() => {
    const acc: Record<1 | 2 | 3, MatchDto[]> = { 1: [], 2: [], 3: [] };
    for (const m of matchesQuery.data ?? []) {
      const r = (m.roundNumber as 1 | 2 | 3 | null) ?? 1;
      acc[r].push(m);
    }
    return acc;
  }, [matchesQuery.data]);

  const filledCount = Object.keys(draft).length;
  const isLocked = guessesQuery.data ? !guessesQuery.data.isOpen : false;
  const alreadySubmitted = Boolean(guessesQuery.data?.submittedAt);

  if (matchesQuery.isLoading || guessesQuery.isLoading) {
    return <p className="text-emerald-200/70">Carregando jogos...</p>;
  }
  if (matchesQuery.error || guessesQuery.error) {
    const msg = (matchesQuery.error ?? guessesQuery.error) as Error;
    return (
      <div className="card-glow text-red-200">
        <p>{msg.message}</p>
        {msg instanceof ApiError && msg.status === 403 && (
          <p className="mt-2 text-sm text-emerald-100/80">
            Você precisa de uma inscrição ativa para palpitar.{' '}
            <Link to="/dashboard" className="link-accent">
              Voltar ao dashboard
            </Link>
          </p>
        )}
      </div>
    );
  }

  const currentMatches = matchesByRound[activeRound];

  return (
    <div className="space-y-8 pb-40">
      <header className="flex items-end justify-between flex-wrap gap-3">
        <div>
          <p className="text-xs font-bold tracking-[0.4em] text-gold-400">FASE DE GRUPOS</p>
          <h1 className="font-display text-4xl tracking-wider text-white mt-1">
            <span className="text-shimmer">PALPITES</span>
          </h1>
          <p className="text-sm text-emerald-200/70 mt-2">
            Preencha os 72 jogos da fase de grupos. Auto-save a cada 2 s.
          </p>
        </div>
        <div className="text-right">
          <p className="text-xs text-emerald-300/70">
            {filledCount}/72 palpites preenchidos
          </p>
          {lastSavedAt && (
            <p className="text-[11px] text-emerald-200/50 mt-1">
              Rascunho salvo às {lastSavedAt.toLocaleTimeString('pt-BR')}
            </p>
          )}
          {alreadySubmitted && (
            <p className="text-[11px] text-gold-300 mt-1">✓ Submetido</p>
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

      <div className="flex gap-2 border-b border-emerald-500/20">
        {([1, 2, 3] as const).map((r) => (
          <button
            key={r}
            onClick={() => setActiveRound(r)}
            className={
              'px-4 py-2 text-sm font-semibold border-b-2 transition ' +
              (activeRound === r
                ? 'border-gold-400 text-gold-200'
                : 'border-transparent text-emerald-200/60 hover:text-emerald-100')
            }
          >
            Rodada {r}
            <span className="ml-1.5 text-xs text-emerald-300/50">
              ({matchesByRound[r].length})
            </span>
          </button>
        ))}
      </div>

      {GROUP_LETTERS.map((letter) => {
        const groupMatches = currentMatches.filter((m) => m.groupLetter === letter);
        if (groupMatches.length === 0) return null;
        return (
          <section key={letter} className="space-y-3">
            <h2 className="font-display text-xl tracking-wider text-emerald-100/80">
              GRUPO {letter}
            </h2>
            <div className="grid gap-3 sm:grid-cols-2">
              {groupMatches.map((m) => (
                <MatchCard
                  key={m.id}
                  match={m}
                  guess={draft[m.id]}
                  readOnly={isLocked || alreadySubmitted}
                  onChange={(home, away) => updateGuess(m.id, home, away)}
                />
              ))}
            </div>
          </section>
        );
      })}

      {/* Navegação de rodada no fim da lista (espelha as abas do topo). */}
      <div className="flex items-center justify-between gap-3 border-t border-emerald-500/15 pt-6">
        <button
          onClick={() => goToRound(Math.max(1, activeRound - 1) as 1 | 2 | 3)}
          disabled={activeRound <= 1}
          className="btn-secondary text-sm disabled:opacity-30"
        >
          ← Rodada anterior
        </button>
        <span className="text-xs uppercase tracking-widest text-emerald-300/60">
          Rodada {activeRound} de 3
        </span>
        <button
          onClick={() => goToRound(Math.min(3, activeRound + 1) as 1 | 2 | 3)}
          disabled={activeRound >= 3}
          className="btn-gold text-sm disabled:opacity-30"
        >
          Próxima rodada →
        </button>
      </div>

      <div className="fixed bottom-0 inset-x-0 z-20 border-t border-emerald-500/20 bg-midnight-900/90 backdrop-blur-md">
        <div className="max-w-6xl mx-auto px-4 py-3 flex flex-col sm:flex-row sm:items-center justify-between gap-2 sm:gap-3">
          <div className="text-xs text-emerald-200/70 text-center sm:text-left">
            {alreadySubmitted
              ? '🔒 Palpites finalizados — não podem mais ser alterados.'
              : isLocked
                ? '🔒 Janela fechada — palpites travados'
                : `Você preencheu ${filledCount}/72. Depois de submeter, não dá pra editar mais.`}
          </div>
          <div className="flex flex-col sm:flex-row items-stretch gap-2 shrink-0">
            <Link to="/bracket" className="btn-secondary text-sm">
              {alreadySubmitted ? 'Ver chaveamento' : 'Pré-visualizar chaveamento'}
            </Link>
            {!alreadySubmitted && (
              <button
                className="btn-gold text-sm"
                disabled={isLocked || filledCount < 72 || submitMutation.isPending}
                onClick={() => setShowConfirm(true)}
              >
                {submitMutation.isPending ? 'Enviando...' : 'Submeter palpites finais →'}
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
              SUBMETER PALPITES
            </h3>
            <p className="text-sm text-emerald-100/85 mb-4">
              Você está prestes a submeter <strong>{filledCount}</strong> palpites finais. Após
              isso o chaveamento é gerado e <strong>não pode mais ser editado</strong> mesmo antes
              do início da Copa.
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
                {submitMutation.isPending ? 'Enviando...' : 'Confirmar e submeter'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
