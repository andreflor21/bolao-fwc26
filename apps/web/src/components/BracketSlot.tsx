import type { BracketFixtureDto } from '@bolao/shared';
import { flagUrl } from '../lib/flags';

interface Props {
  fixture: BracketFixtureDto;
}

export function BracketSlot({ fixture }: Props) {
  const winner = fixture.predictedWinnerCode;
  return (
    <div className="rounded-lg border border-emerald-500/15 bg-midnight-900/60 px-3 py-2 text-xs w-44">
      <p className="text-[9px] tracking-[0.3em] text-gold-300/70 mb-1">{fixture.id}</p>
      <SlotRow code={fixture.topTeamCode} highlighted={winner === fixture.topTeamCode} />
      <div className="my-0.5 h-px bg-emerald-500/15" />
      <SlotRow code={fixture.bottomTeamCode} highlighted={winner === fixture.bottomTeamCode} />
    </div>
  );
}

function SlotRow({ code, highlighted }: { code: string | null; highlighted: boolean }) {
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
      {highlighted && <span className="text-[10px]">✓</span>}
    </div>
  );
}
