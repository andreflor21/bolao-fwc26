import type {
  BracketFixtureDto,
  KnockoutScoreEntryDto,
  OfficialFixtureResultDto,
} from '@bolao/shared';
import { flagUrl } from '../lib/flags';

interface Props {
  fixture: BracketFixtureDto;
  /** Placar que o jogador palpitou para este confronto. */
  guess?: KnockoutScoreEntryDto;
  /** Resultado oficial real (quando já lançado). */
  official?: OfficialFixtureResultDto;
}

export function BracketSlot({ fixture, guess, official }: Props) {
  const winner = fixture.predictedWinnerCode;
  return (
    <div className="rounded-lg border border-emerald-500/15 bg-midnight-900/60 px-3 py-2 text-xs w-44">
      <p className="text-[9px] tracking-[0.3em] text-gold-300/70 mb-1">{fixture.id}</p>
      <SlotRow
        code={fixture.topTeamCode}
        goals={guess?.homeGoals}
        highlighted={winner === fixture.topTeamCode}
      />
      <div className="my-0.5 h-px bg-emerald-500/15" />
      <SlotRow
        code={fixture.bottomTeamCode}
        goals={guess?.awayGoals}
        highlighted={winner === fixture.bottomTeamCode}
      />
      {official && (
        <div className="mt-1.5 pt-1.5 border-t border-emerald-500/15 flex items-center justify-between gap-1 text-[10px]">
          <span className="text-emerald-300/50 uppercase tracking-wider">Real</span>
          <span className="flex items-center gap-1 text-emerald-50 font-semibold">
            <span>{official.homeTeamCode ?? '—'}</span>
            <span className="font-display text-white">
              {official.homeGoals}×{official.awayGoals}
            </span>
            <span>{official.awayTeamCode ?? '—'}</span>
          </span>
        </div>
      )}
    </div>
  );
}

function SlotRow({
  code,
  goals,
  highlighted,
}: {
  code: string | null;
  goals?: number;
  highlighted: boolean;
}) {
  if (!code) {
    return <div className="text-emerald-200/30 italic py-0.5">— a definir —</div>;
  }
  const url = flagUrl(code);
  return (
    <div
      className={
        'flex items-center justify-between py-0.5 gap-2 ' +
        (highlighted ? 'text-gold-200 font-bold' : 'text-emerald-100/85')
      }
    >
      <span className="flex items-center gap-1.5 min-w-0">
        {url && (
          <img
            src={url}
            alt=""
            loading="lazy"
            className="w-4 h-3 object-cover rounded-[2px] ring-1 ring-black/20 shrink-0"
          />
        )}
        <span className="truncate">{code}</span>
      </span>
      <span className="flex items-center gap-1 shrink-0">
        {goals !== undefined && <span className="font-display text-white">{goals}</span>}
        {highlighted && <span className="text-[10px]">✓</span>}
      </span>
    </div>
  );
}
