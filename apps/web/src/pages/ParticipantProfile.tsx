import { useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { api, ApiError } from '../lib/api';
import { flagUrl } from '../lib/flags';
import {
  SCORE_RULE_LABELS,
  knockoutRuleLabel,
  type ScoreRule,
  type InvitablePoolDto,
  type SidePoolInviteDto,
  type RankingEvolutionDto,
} from '@bolao/shared';
import { RankingEvolutionChart } from '../components/RankingEvolutionChart';

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
        teamPoints: number | null;
        scorePoints: number | null;
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

type Tab = 'evolution' | 'group' | 'knockout';

export function ParticipantProfile() {
  const { userId } = useParams<{ userId: string }>();
  const [tab, setTab] = useState<Tab>('evolution');

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

  const evolutionQuery = useQuery({
    queryKey: ['profile', userId, 'evolution'],
    queryFn: () => api<RankingEvolutionDto>(`/profiles/${userId}/evolution`),
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
          {/* Convites de bolão paralelo que o próprio usuário recebeu (badge no nome). */}
          {header.isSelf && <MyInviteBadges />}
        </div>
      </header>

      {/* Convidar este participante para um bolão paralelo do qual você participa. */}
      {!header.isSelf && header.userId && <InviteToSidePools targetUserId={header.userId} />}

      <div className="flex gap-2 border-b border-emerald-500/20 overflow-x-auto">
        <TabBtn active={tab === 'evolution'} onClick={() => setTab('evolution')}>
          Evolução
        </TabBtn>
        <TabBtn active={tab === 'group'} onClick={() => setTab('group')}>
          Fase de grupos
        </TabBtn>
        <TabBtn active={tab === 'knockout'} onClick={() => setTab('knockout')}>
          Mata-mata
        </TabBtn>
      </div>

      {tab === 'evolution' &&
        (evolutionQuery.isLoading ? (
          <p className="text-sm text-emerald-200/60">Carregando evolução...</p>
        ) : evolutionQuery.data ? (
          <RankingEvolutionChart data={evolutionQuery.data} />
        ) : (
          <p className="text-sm text-emerald-200/60">Não foi possível carregar a evolução.</p>
        ))}
      {tab === 'group' && <GroupGuesses matches={groupQuery.data?.matches ?? []} />}
      {tab === 'knockout' && (
        <KnockoutGuesses response={koQuery.data} loading={koQuery.isLoading} />
      )}
    </div>
  );
}

/**
 * Badges dos convites de bolão paralelo recebidos pelo próprio usuário. Cada um
 * pode ser aceito ou recusado direto aqui, ao lado do nome.
 */
function MyInviteBadges() {
  const qc = useQueryClient();
  const [error, setError] = useState<string | null>(null);
  const invitesQuery = useQuery({
    queryKey: ['side-pool-invites', 'received'],
    queryFn: () => api<SidePoolInviteDto[]>('/side-pools/invites/received'),
  });

  const respond = useMutation({
    mutationFn: ({ inviteId, action }: { inviteId: string; action: 'accept' | 'decline' }) =>
      api(`/side-pools/invites/${inviteId}/${action}`, { method: 'POST' }),
    onSuccess: () => {
      setError(null);
      qc.invalidateQueries({ queryKey: ['side-pool-invites', 'received'] });
      qc.invalidateQueries({ queryKey: ['side-pools'] });
      qc.invalidateQueries({ queryKey: ['ranking'] });
    },
    onError: (e: unknown) => setError(e instanceof ApiError ? e.message : (e as Error).message),
  });

  const invites = invitesQuery.data ?? [];
  if (invites.length === 0) return null;

  return (
    <div className="mt-3 space-y-2">
      <p className="text-[10px] tracking-[0.2em] text-gold-300/80">
        CONVITES PARA BOLÕES PARALELOS
      </p>
      <div className="flex flex-wrap gap-2">
        {invites.map((inv) => (
          <span
            key={inv.inviteId}
            className="inline-flex items-center gap-2 rounded-full border border-gold-400/40 bg-gold-400/10 pl-3 pr-1.5 py-1 text-xs text-gold-100"
          >
            <span className="truncate max-w-[200px]">
              🎟️ <strong>{inv.sidePoolName}</strong>
              <span className="text-gold-200/60"> · {inv.invitedByName}</span>
            </span>
            <button
              type="button"
              disabled={respond.isPending}
              onClick={() => respond.mutate({ inviteId: inv.inviteId, action: 'accept' })}
              className="rounded-full bg-emerald-500/80 hover:bg-emerald-400 text-midnight-900 font-bold w-5 h-5 grid place-items-center disabled:opacity-50"
              title="Aceitar convite"
            >
              ✓
            </button>
            <button
              type="button"
              disabled={respond.isPending}
              onClick={() => respond.mutate({ inviteId: inv.inviteId, action: 'decline' })}
              className="rounded-full bg-red-500/70 hover:bg-red-400 text-white font-bold w-5 h-5 grid place-items-center disabled:opacity-50"
              title="Recusar convite"
            >
              ✕
            </button>
          </span>
        ))}
      </div>
      {error && <p className="text-[11px] text-red-300">{error}</p>}
    </div>
  );
}

/**
 * Seção exibida ao abrir o perfil de OUTRO participante: lista os bolões
 * paralelos do usuário logado e permite convidá-lo. Qualquer membro pode
 * convidar (não só o dono).
 */
function InviteToSidePools({ targetUserId }: { targetUserId: string }) {
  const qc = useQueryClient();
  const [error, setError] = useState<string | null>(null);
  const queryKey = ['side-pools', 'invitable', targetUserId];

  const poolsQuery = useQuery({
    queryKey,
    queryFn: () => api<InvitablePoolDto[]>(`/side-pools/invitable/${targetUserId}`),
  });

  const invalidate = () => {
    setError(null);
    qc.invalidateQueries({ queryKey });
  };
  const onError = (e: unknown) =>
    setError(e instanceof ApiError ? e.message : (e as Error).message);

  const inviteMutation = useMutation({
    mutationFn: (sidePoolId: string) =>
      api(`/side-pools/${sidePoolId}/invites`, {
        method: 'POST',
        body: JSON.stringify({ inviteeUserId: targetUserId }),
      }),
    onSuccess: invalidate,
    onError,
  });
  const cancelMutation = useMutation({
    mutationFn: (inviteId: string) =>
      api(`/side-pools/invites/${inviteId}/decline`, { method: 'POST' }),
    onSuccess: invalidate,
    onError,
  });

  const pools = poolsQuery.data ?? [];
  if (poolsQuery.isLoading || pools.length === 0) return null;
  const busy = inviteMutation.isPending || cancelMutation.isPending;

  return (
    <section className="card space-y-3">
      <p className="text-[10px] tracking-[0.2em] text-gold-300/80">
        CONVIDAR PARA UM BOLÃO PARALELO
      </p>
      <ul className="space-y-2">
        {pools.map((p) => (
          <li
            key={p.sidePoolId}
            className="flex items-center justify-between gap-3 rounded-xl border border-emerald-500/15 bg-midnight-900/40 px-3 py-2"
          >
            <div className="min-w-0">
              <p className="text-sm font-semibold text-emerald-50 truncate">{p.name}</p>
              <p className="text-[11px] text-emerald-200/50">
                {p.memberCount}/{p.maxMembers} participantes
              </p>
            </div>
            {p.state === 'invitable' && (
              <button
                className="btn-gold text-xs py-1.5 px-3 shrink-0"
                disabled={busy}
                onClick={() => inviteMutation.mutate(p.sidePoolId)}
              >
                Convidar
              </button>
            )}
            {p.state === 'invited' && (
              <div className="flex items-center gap-2 shrink-0">
                <span className="text-[11px] text-gold-200">Convite enviado</span>
                {p.inviteId && (
                  <button
                    className="btn-secondary text-[11px] py-1 px-2"
                    disabled={busy}
                    onClick={() => cancelMutation.mutate(p.inviteId!)}
                  >
                    Cancelar
                  </button>
                )}
              </div>
            )}
            {p.state === 'member' && (
              <span className="chip text-[10px] shrink-0">Já participa</span>
            )}
            {p.state === 'full' && (
              <span className="text-[11px] text-emerald-200/40 shrink-0">Lotado</span>
            )}
          </li>
        ))}
      </ul>
      {error && <p className="text-[11px] text-red-300">{error}</p>}
    </section>
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

function GroupGuesses({ matches }: { matches: GroupGuess[] }) {
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
            +{m.guess.points} pts{' '}
            {m.guess.ruleApplied ? `· ${SCORE_RULE_LABELS[m.guess.ruleApplied as ScoreRule] ?? m.guess.ruleApplied}` : ''}
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
}: {
  response: KnockoutResponse | undefined;
  loading: boolean;
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
          <span className="chip text-[10px]">
            +{f.guess.points} pts
            {f.guess.teamPoints != null && f.guess.scorePoints != null
              ? ` · ${knockoutRuleLabel(f.guess.teamPoints, f.guess.scorePoints)}`
              : ''}
          </span>
        </div>
      )}
    </li>
  );
}
