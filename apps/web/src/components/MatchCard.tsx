import { SCORE_RULE_LABELS, type GuessScoreDto, type MatchDto } from '@bolao/shared';
import { flagUrl } from '../lib/flags';

interface Props {
  match: MatchDto;
  guess?: { homeGoals: number; awayGoals: number };
  onChange?: (homeGoals: number, awayGoals: number) => void;
  readOnly?: boolean;
  /** Pontuação do palpite — quando presente, o card mostra o resultado final. */
  score?: GuessScoreDto | null;
}

function TeamFlag({ code, className = '' }: { code: string | null; className?: string }) {
  const url = flagUrl(code);
  if (!url) {
    return (
      <span className={`inline-block bg-emerald-500/15 rounded-sm ${className}`} aria-hidden />
    );
  }
  return (
    <img
      src={url}
      alt=""
      loading="lazy"
      className={`inline-block object-cover rounded-sm shadow-sm ring-1 ring-black/20 ${className}`}
    />
  );
}

const BRT_FORMATTER = new Intl.DateTimeFormat('pt-BR', {
  weekday: 'short',
  day: '2-digit',
  month: 'short',
  hour: '2-digit',
  minute: '2-digit',
  timeZone: 'America/Sao_Paulo',
});

function kickoffLabel(iso: string): string {
  try {
    return BRT_FORMATTER.format(new Date(iso));
  } catch {
    return iso;
  }
}

export function MatchCard({ match, guess, onChange, readOnly, score }: Props) {
  const home = guess?.homeGoals ?? '';
  const away = guess?.awayGoals ?? '';
  const hasResult =
    match.homeGoalsOfficial !== null && match.awayGoalsOfficial !== null;

  function clamp(v: string): number {
    const n = Number.parseInt(v, 10);
    if (Number.isNaN(n)) return 0;
    return Math.max(0, Math.min(15, n));
  }

  return (
    <div className="rounded-xl border border-emerald-500/15 bg-midnight-900/40 px-3 py-3 flex flex-col gap-2">
      <div className="flex items-center justify-between text-[11px] text-emerald-200/60">
        <span>{kickoffLabel(match.kickoffAt)}</span>
        {match.city && <span className="truncate ml-2 max-w-[60%]">{match.city}</span>}
      </div>
      <div className="grid grid-cols-[1fr,auto,1fr] items-center gap-3">
        <div className="flex items-center justify-end gap-2 min-w-0">
          <div className="text-right min-w-0">
            <p className="text-sm font-semibold text-emerald-50 truncate">{match.homeTeamName ?? match.homeTeamCode}</p>
            <p className="text-[10px] tracking-widest text-emerald-300/60">{match.homeTeamCode}</p>
          </div>
          <TeamFlag code={match.homeTeamCode} className="w-7 h-5 shrink-0" />
        </div>
        <div className="flex items-center gap-2">
          <input
            inputMode="numeric"
            pattern="[0-9]*"
            min={0}
            max={15}
            value={home}
            disabled={readOnly}
            onChange={(e) => onChange?.(clamp(e.target.value), guess?.awayGoals ?? 0)}
            className="w-14 h-12 rounded-lg border border-emerald-500/30 bg-midnight-800 px-2 text-center font-display text-xl text-white outline-none focus:border-gold-400/70 focus:ring-2 focus:ring-gold-400/30 disabled:opacity-60"
            aria-label="Gols do mandante"
          />
          <span className="text-emerald-300/40 font-bold">×</span>
          <input
            inputMode="numeric"
            pattern="[0-9]*"
            min={0}
            max={15}
            value={away}
            disabled={readOnly}
            onChange={(e) => onChange?.(guess?.homeGoals ?? 0, clamp(e.target.value))}
            className="w-14 h-12 rounded-lg border border-emerald-500/30 bg-midnight-800 px-2 text-center font-display text-xl text-white outline-none focus:border-gold-400/70 focus:ring-2 focus:ring-gold-400/30 disabled:opacity-60"
            aria-label="Gols do visitante"
          />
        </div>
        <div className="flex items-center gap-2 min-w-0">
          <TeamFlag code={match.awayTeamCode} className="w-7 h-5 shrink-0" />
          <div className="text-left min-w-0">
            <p className="text-sm font-semibold text-emerald-50 truncate">{match.awayTeamName ?? match.awayTeamCode}</p>
            <p className="text-[10px] tracking-widest text-emerald-300/60">{match.awayTeamCode}</p>
          </div>
        </div>
      </div>

      {hasResult && (
        <div className="mt-1 flex flex-wrap items-center justify-between gap-x-3 gap-y-1 border-t border-emerald-500/15 pt-2">
          <span className="text-[11px] uppercase tracking-wider text-emerald-300/60">
            Resultado final
          </span>
          <div className="flex items-center gap-2 flex-wrap">
            <span className="flex items-center gap-1.5 text-sm text-white">
              <TeamFlag code={match.homeTeamCode} className="w-5 h-3.5" />
              <span className="font-semibold">{match.homeTeamCode}</span>
              <span className="font-display">
                {match.homeGoalsOfficial} <span className="text-emerald-300/40">×</span>{' '}
                {match.awayGoalsOfficial}
              </span>
              <span className="font-semibold">{match.awayTeamCode}</span>
              <TeamFlag code={match.awayTeamCode} className="w-5 h-3.5" />
            </span>
            {score && (
              <span
                className={
                  'inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-xs font-bold ' +
                  (score.points > 0
                    ? 'bg-gold-400/15 text-gold-200 border border-gold-400/30'
                    : 'bg-midnight-800 text-emerald-200/60 border border-emerald-500/20')
                }
                title={SCORE_RULE_LABELS[score.ruleApplied]}
              >
                +{score.points} pts
              </span>
            )}
          </div>
        </div>
      )}
      {hasResult && score && (
        <p className="text-[10px] text-emerald-300/50 text-right -mt-1">
          {SCORE_RULE_LABELS[score.ruleApplied]}
        </p>
      )}
    </div>
  );
}
