import { useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { api, ApiError } from '../lib/api';
import { flagUrl } from '../lib/flags';

interface ParticipantHeader {
  userId: string;
  name: string;
  points: number;
  exactScores: number;
  isSelf: boolean;
}

interface GroupGuess {
  matchId: string;
  groupLetter: string | null;
  roundNumber: number | null;
  kickoffAt: string;
  homeTeamCode: string | null;
  awayTeamCode: string | null;
  homeTeamName: string | null;
  awayTeamName: string | null;
  homeGoalsOfficial: number | null;
  awayGoalsOfficial: number | null;
  isLocked: boolean;
  guess: { homeGoals: number; awayGoals: number; points: number | null; ruleApplied: string | null } | null;
}

interface GroupResponse {
  header: ParticipantHeader;
  matches: GroupGuess[];
}

interface KnockoutGuess {
  fixtureId: string;
  stage: string;
  kickoffAt: string | null;
  isLocked: boolean;
  homeTeamCodeOfficial: string | null;
  awayTeamCodeOfficial: string | null;
  homeGoalsOfficial: number | null;
  awayGoalsOfficial: number | null;
  guess:
    | {
        topTeamCode: string | null;
        bottomTeamCode: string | null;
        predictedWinnerCode: string | null;
        homeGoals: number | null;
        awayGoals: number | null;
        advancesTeamCode: string | null;
        points: number | null;
      }
    | null;
}

interface KnockoutResponse {
  header: ParticipantHeader;
  fixtures: KnockoutGuess[];
  noPayload: boolean;
}

const STAGE_LABEL: Record<string, string> = {
  r32: '16-avos',
  R32: '16-avos',
  r16: 'Oitavas',
  R16: 'Oitavas',
  qf: 'Quartas',
  QF: 'Quartas',
  sf: 'Semifinal',
  SF: 'Semifinal',
  tp: '3º lugar',
  TP: '3º lugar',
  final: 'Final',
  FINAL: 'Final',
  F: 'Final',
};

const BRT = new Intl.DateTimeFormat('pt-BR', {
  timeZone: 'America/Sao_Paulo',
  weekday: 'short',
  day: '2-digit',
  month: 'short',
  hour: '2-digit',
  minute: '2-digit',
});

function Flag({ code, size = 'sm' }: { code: string | null; size?: 'sm' | 'md' }) {
  const url = flagUrl(code);
  const cls = size === 'md' ? 'w-7 h-5' : 'w-6 h-4';
  if (!url) return <span className={`inline-block ${cls} rounded-sm bg-emerald-500/15`} />;
  return (
    <img src={url} alt="" loading="lazy" className={`inline-block ${cls} rounded-sm object-cover`} />
  );
}

type Tab = 'group' | 'knockout';

export function ParticipantProfile() {
  const { userId } = useParams<{ userId: string }>();
  const [tab, setTab] = useState<Tab>('group');

  const groupQuery = useQuery({
    queryKey: ['profile', userId, 'group'],
    queryFn: () => api<GroupResponse>(`/profiles/${userId}/group-guesses`),
    enabled: Boolean(userId),
  });

  const koQuery = useQuery({
    queryKey: ['profile', userId, 'knockout'],
    queryFn: () => api<KnockoutResponse>(`/profiles/${userId}/knockout-guesses`),
    enabled: Boolean(userId),
  });

  const header = groupQuery.data?.header ?? koQuery.data?.header ?? null;

  if (groupQuery.error) {
    const err = groupQuery.error as Error;
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

  if (groupQuery.isLoading || !header) {
    return <p className="text-emerald-200/70">Carregando perfil...</p>;
  }

  return (
    <div className="space-y-6">
      <Link to="/participantes" className="text-xs text-emerald-200/70 hover:text-emerald-100">
        ← Voltar para participantes
      </Link>

      <header className="card-glow flex flex-col sm:flex-row sm:items-center gap-4">
        <div className="h-14 w-14 rounded-full bg-gradient-to-br from-gold-300 to-gold-600 grid place-items-center text-midnight-900 font-bold text-2xl shrink-0">
          {header.name.charAt(0).toUpperCase()}
        </div>
        <div className="flex-1 min-w-0">
          <h1 className="font-display text-2xl sm:text-3xl tracking-wider text-white truncate">
            {header.name}
            {header.isSelf && (
              <span className="ml-2 chip text-[10px] align-middle">você</span>
            )}
          </h1>
          <p className="text-sm text-emerald-200/70 mt-1">
            <span className="text-gold-300 font-mono text-base">{header.points}</span> pts ·{' '}
            <span className="text-emerald-300 font-mono text-base">{header.exactScores}</span> placar(es) exato(s)
          </p>
        </div>
      </header>

      <div className="flex gap-2 border-b border-emerald-500/20 overflow-x-auto">
        <TabBtn active={tab === 'group'} onClick={() => setTab('group')}>
          Fase de grupos
        </TabBtn>
        <TabBtn active={tab === 'knockout'} onClick={() => setTab('knockout')}>
          Mata-mata
        </TabBtn>
      </div>

      {tab === 'group' && (
        <GroupGuesses
          matches={groupQuery.data?.matches ?? []}
          isSelf={header.isSelf}
        />
      )}
      {tab === 'knockout' && (
        <KnockoutGuesses
          response={koQuery.data}
          loading={koQuery.isLoading}
          isSelf={header.isSelf}
        />
      )}
    </div>
  );
}

function TabBtn({
  active,
  onClick,
  children,
}: {
  active: boolean;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      onClick={onClick}
      className={
        'px-4 py-2 text-sm font-semibold border-b-2 transition whitespace-nowrap ' +
        (active
          ? 'border-gold-400 text-gold-200'
          : 'border-transparent text-emerald-200/60 hover:text-emerald-100')
      }
    >
      {children}
    </button>
  );
}

function GroupGuesses({ matches, isSelf }: { matches: GroupGuess[]; isSelf: boolean }) {
  if (matches.length === 0) {
    return <p className="text-sm text-emerald-200/60">Sem palpites de grupos.</p>;
  }
  // Agrupa por rodada pra leitura ficar mais clara.
  const byRound = new Map<number, GroupGuess[]>();
  for (const m of matches) {
    const r = m.roundNumber ?? 0;
    const list = byRound.get(r) ?? [];
    list.push(m);
    byRound.set(r, list);
  }
  const rounds = Array.from(byRound.keys()).sort((a, b) => a - b);

  return (
    <div className="space-y-6">
      {!isSelf && (
        <p className="text-xs text-emerald-200/60">
          🔒 Palpites de jogos que ainda não começaram ficam ocultos até o apito inicial.
        </p>
      )}
      {rounds.map((r) => (
        <section key={r} className="space-y-2">
          <h2 className="font-display text-lg tracking-wider text-emerald-100/80">
            Rodada {r || '?'}
          </h2>
          <ul className="space-y-2">
            {(byRound.get(r) ?? []).map((m) => (
              <GroupGuessRow key={m.matchId} m={m} />
            ))}
          </ul>
        </section>
      ))}
    </div>
  );
}

function GroupGuessRow({ m }: { m: GroupGuess }) {
  const home = m.homeTeamName ?? m.homeTeamCode ?? '?';
  const away = m.awayTeamName ?? m.awayTeamCode ?? '?';
  const hasOfficial = m.homeGoalsOfficial !== null && m.awayGoalsOfficial !== null;
  return (
    <li className="rounded-xl border border-emerald-500/15 bg-midnight-900/40 px-3 py-3 flex flex-wrap items-center gap-x-3 gap-y-2">
      <div className="w-full sm:w-auto sm:min-w-[160px] flex justify-between sm:block text-[11px] text-emerald-200/60">
        <span>{BRT.format(new Date(m.kickoffAt))}</span>
        <span className="text-emerald-300/50">Grupo {m.groupLetter ?? '?'}</span>
      </div>

      <div className="flex flex-1 items-center justify-end gap-2 min-w-0">
        <span className="text-sm text-emerald-50 truncate">{home}</span>
        <Flag code={m.homeTeamCode} />
      </div>

      <div className="flex items-center gap-2 font-display text-lg shrink-0">
        {m.guess ? (
          <span className="text-gold-200">
            {m.guess.homeGoals}×{m.guess.awayGoals}
          </span>
        ) : (
          <span className="text-emerald-300/40 text-sm">🔒</span>
        )}
        {hasOfficial && (
          <span className="text-[11px] text-emerald-200/60">
            (oficial {m.homeGoalsOfficial}×{m.awayGoalsOfficial})
          </span>
        )}
      </div>

      <div className="flex flex-1 items-center gap-2 min-w-0">
        <Flag code={m.awayTeamCode} />
        <span className="text-sm text-emerald-50 truncate">{away}</span>
      </div>

      <div className="w-full sm:w-auto flex justify-end">
        {m.guess?.points != null ? (
          <span className="chip text-[10px]">
            +{m.guess.points} pts {m.guess.ruleApplied ? `· ${m.guess.ruleApplied}` : ''}
          </span>
        ) : !m.isLocked ? (
          <span className="text-[10px] text-emerald-300/40">aguardando início</span>
        ) : null}
      </div>
    </li>
  );
}

function KnockoutGuesses({
  response,
  loading,
  isSelf,
}: {
  response: KnockoutResponse | undefined;
  loading: boolean;
  isSelf: boolean;
}) {
  if (loading) return <p className="text-sm text-emerald-200/60">Carregando mata-mata...</p>;
  if (!response) return <p className="text-sm text-emerald-200/60">Sem dados de mata-mata.</p>;
  if (response.noPayload) {
    return (
      <p className="text-sm text-emerald-200/60">
        Esse participante ainda não enviou o bracket dele.
      </p>
    );
  }
  const fixtures = response.fixtures;
  const byStage = new Map<string, KnockoutGuess[]>();
  for (const f of fixtures) {
    const list = byStage.get(f.stage) ?? [];
    list.push(f);
    byStage.set(f.stage, list);
  }
  return (
    <div className="space-y-6">
      {!isSelf && (
        <p className="text-xs text-emerald-200/60">
          🔒 Palpites de confrontos que ainda não começaram ficam ocultos até o apito inicial.
        </p>
      )}
      {Array.from(byStage.entries()).map(([stage, list]) => (
        <section key={stage} className="space-y-2">
          <h2 className="font-display text-lg tracking-wider text-emerald-100/80">
            {STAGE_LABEL[stage] ?? stage}
          </h2>
          <ul className="grid gap-2 sm:grid-cols-2">
            {list.map((f) => (
              <KoCard key={f.fixtureId} f={f} />
            ))}
          </ul>
        </section>
      ))}
    </div>
  );
}

function KoCard({ f }: { f: KnockoutGuess }) {
  const officialHasResult =
    f.homeGoalsOfficial !== null && f.awayGoalsOfficial !== null;
  return (
    <li className="rounded-xl border border-emerald-500/15 bg-midnight-900/40 px-3 py-3 space-y-2">
      <div className="flex items-center justify-between text-[11px] text-emerald-200/60">
        <span>{f.fixtureId}</span>
        {f.kickoffAt && <span>{BRT.format(new Date(f.kickoffAt))}</span>}
      </div>
      {f.guess ? (
        <>
          <div className="flex items-center justify-between gap-2 text-sm">
            <span className="flex items-center gap-1.5 min-w-0">
              <Flag code={f.guess.topTeamCode} />
              <span className="truncate text-emerald-50">{f.guess.topTeamCode ?? '—'}</span>
            </span>
            <span className="font-display text-lg text-gold-200 shrink-0">
              {f.guess.homeGoals ?? '?'}×{f.guess.awayGoals ?? '?'}
            </span>
            <span className="flex items-center gap-1.5 min-w-0 justify-end">
              <span className="truncate text-emerald-50">{f.guess.bottomTeamCode ?? '—'}</span>
              <Flag code={f.guess.bottomTeamCode} />
            </span>
          </div>
          {f.guess.advancesTeamCode && (
            <p className="text-[10px] text-emerald-300/70 text-center">
              Avança nos pênaltis: <strong>{f.guess.advancesTeamCode}</strong>
            </p>
          )}
        </>
      ) : (
        <p className="text-center text-sm text-emerald-300/50 py-2">
          🔒 Disponível após o início do confronto
        </p>
      )}
      {officialHasResult && (
        <p className="text-[11px] text-emerald-200/70 text-center border-t border-emerald-500/15 pt-2">
          Oficial: {f.homeTeamCodeOfficial ?? '?'} {f.homeGoalsOfficial}×{f.awayGoalsOfficial}{' '}
          {f.awayTeamCodeOfficial ?? '?'}
        </p>
      )}
      {f.guess?.points != null && (
        <div className="flex justify-end">
          <span className="chip text-[10px]">+{f.guess.points} pts</span>
        </div>
      )}
    </li>
  );
}
