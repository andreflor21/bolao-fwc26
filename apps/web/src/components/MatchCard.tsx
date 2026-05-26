import type { MatchDto } from '@bolao/shared';

interface Props {
  match: MatchDto;
  guess?: { homeGoals: number; awayGoals: number };
  onChange?: (homeGoals: number, awayGoals: number) => void;
  readOnly?: boolean;
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

export function MatchCard({ match, guess, onChange, readOnly }: Props) {
  const home = guess?.homeGoals ?? '';
  const away = guess?.awayGoals ?? '';

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
        <div className="text-right">
          <p className="text-sm font-semibold text-emerald-50 truncate">{match.homeTeamName ?? match.homeTeamCode}</p>
          <p className="text-[10px] tracking-widest text-emerald-300/60">{match.homeTeamCode}</p>
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
            className="w-12 rounded-lg border border-emerald-500/30 bg-midnight-800 px-2 py-1.5 text-center font-display text-lg text-white outline-none focus:border-gold-400/70 focus:ring-2 focus:ring-gold-400/30 disabled:opacity-60"
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
            className="w-12 rounded-lg border border-emerald-500/30 bg-midnight-800 px-2 py-1.5 text-center font-display text-lg text-white outline-none focus:border-gold-400/70 focus:ring-2 focus:ring-gold-400/30 disabled:opacity-60"
            aria-label="Gols do visitante"
          />
        </div>
        <div className="text-left">
          <p className="text-sm font-semibold text-emerald-50 truncate">{match.awayTeamName ?? match.awayTeamCode}</p>
          <p className="text-[10px] tracking-widest text-emerald-300/60">{match.awayTeamCode}</p>
        </div>
      </div>
    </div>
  );
}
