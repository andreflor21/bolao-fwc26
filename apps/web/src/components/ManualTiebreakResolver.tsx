import { useMemo, useState } from 'react';
import type {
  BracketPreviewDto,
  GroupLetter,
  GroupStandingDto,
  UnresolvedTieDto,
} from '@bolao/shared';
import { flagUrl } from '../lib/flags';

interface Props {
  bracket: BracketPreviewDto;
  readOnly?: boolean;
  saving?: boolean;
  onSave?: (orders: Array<{ groupLetter: GroupLetter; teamCodes: string[] }>) => void;
}

/**
 * Surfaces the subsets of teams the engine couldn't separate via H2H +
 * overall stats, and lets the user reorder them with up/down buttons.
 * Touch-friendly (44 px targets) and works without a drag-and-drop lib.
 */
export function ManualTiebreakResolver({ bracket, readOnly = false, saving = false, onSave }: Props) {
  const unresolved = bracket.unresolvedTies;

  // Initialize local order from the current standings (so the user sees the
  // engine's FIFA-rank fallback / their last saved manual order as a baseline).
  const initial = useMemo(() => {
    const acc: Partial<Record<GroupLetter, string[]>> = {};
    for (const tie of unresolved) {
      const standings = bracket.groups[tie.groupLetter] ?? [];
      const tied = standings.filter((s) => tie.teamCodes.includes(s.teamCode));
      acc[tie.groupLetter] = tied.map((s) => s.teamCode);
    }
    return acc;
  }, [unresolved, bracket.groups]);

  const [orders, setOrders] = useState<Partial<Record<GroupLetter, string[]>>>(initial);
  const [dirty, setDirty] = useState(false);

  function move(group: GroupLetter, idx: number, dir: -1 | 1) {
    setOrders((prev) => {
      const cur = prev[group] ?? initial[group] ?? [];
      const next = [...cur];
      const target = idx + dir;
      if (target < 0 || target >= next.length) return prev;
      [next[idx], next[target]] = [next[target]!, next[idx]!];
      return { ...prev, [group]: next };
    });
    setDirty(true);
  }

  if (unresolved.length === 0) return null;

  return (
    <section className="card-glow space-y-4 border-gold-400/40 bg-gold-400/5">
      <div>
        <p className="text-xs font-bold tracking-[0.4em] text-gold-400">EMPATE DETECTADO</p>
        <h2 className="font-display text-xl tracking-wider text-white mt-1">
          Resolver empate(s) {unresolved.length > 1 ? `em ${unresolved.length} grupos` : ''}
        </h2>
        <p className="text-sm text-emerald-100/80 mt-2">
          Os critérios automáticos (pontos H2H → saldo H2H → gols H2H → saldo geral → gols
          gerais) não conseguiram separar os times abaixo. Você define a ordem em que eles
          passam. Sem sua escolha, o ranking FIFA decide automaticamente.
        </p>
      </div>

      <div className="space-y-4">
        {unresolved.map((tie) => (
          <TieGroup
            key={tie.groupLetter}
            tie={tie}
            standings={bracket.groups[tie.groupLetter] ?? []}
            current={orders[tie.groupLetter] ?? initial[tie.groupLetter] ?? []}
            readOnly={readOnly}
            onMoveUp={(idx) => move(tie.groupLetter, idx, -1)}
            onMoveDown={(idx) => move(tie.groupLetter, idx, 1)}
          />
        ))}
      </div>

      {!readOnly && (
        <div className="flex items-center justify-end gap-2 pt-2 border-t border-gold-400/20">
          {!dirty && (
            <p className="text-xs text-emerald-200/60 mr-auto">
              Use os botões ▲▼ para reordenar — depois clique em "Salvar ordem".
            </p>
          )}
          <button
            className="btn-gold text-sm"
            disabled={!dirty || saving || !onSave}
            onClick={() => {
              if (!onSave) return;
              const payload = (Object.entries(orders) as Array<[GroupLetter, string[]]>).map(
                ([groupLetter, teamCodes]) => ({ groupLetter, teamCodes }),
              );
              onSave(payload);
              setDirty(false);
            }}
          >
            {saving ? 'Salvando...' : 'Salvar ordem'}
          </button>
        </div>
      )}
    </section>
  );
}

function TieGroup({
  tie,
  standings,
  current,
  readOnly,
  onMoveUp,
  onMoveDown,
}: {
  tie: UnresolvedTieDto;
  standings: GroupStandingDto[];
  current: string[];
  readOnly: boolean;
  onMoveUp: (idx: number) => void;
  onMoveDown: (idx: number) => void;
}) {
  const positions = tie.positions.length > 0 ? tie.positions : [];
  const range = positions.length > 0
    ? `${Math.min(...positions)}º–${Math.max(...positions)}º`
    : '';

  return (
    <div className="rounded-xl border border-gold-400/30 bg-midnight-900/60 p-3">
      <div className="flex items-center justify-between gap-2 mb-3">
        <p className="text-[11px] tracking-[0.3em] text-gold-300/90">
          GRUPO {tie.groupLetter} {range && `· ${range} colocados`}
        </p>
        <p className="text-[10px] text-emerald-200/50">
          {tie.teamCodes.length} times empatados
        </p>
      </div>

      <ol className="space-y-1.5">
        {current.map((teamCode, idx) => {
          const standing = standings.find((s) => s.teamCode === teamCode);
          const url = flagUrl(teamCode);
          const absolutePos = positions[idx] ?? idx + 1;
          return (
            <li
              key={teamCode}
              className="flex items-center gap-2 rounded-lg bg-midnight-800/70 px-2 py-2 border border-emerald-500/10"
            >
              <span className="font-mono text-xs text-gold-300/80 min-w-[2ch] text-center">
                {absolutePos}º
              </span>
              {url && (
                <img
                  src={url}
                  alt=""
                  loading="lazy"
                  className="w-5 h-3.5 object-cover rounded-[2px] ring-1 ring-black/20"
                />
              )}
              <span className="font-semibold text-emerald-100 text-sm flex-1 truncate">
                {teamCode}
              </span>
              {standing && (
                <span className="text-[10px] text-emerald-200/50 font-mono whitespace-nowrap">
                  {standing.points} pts · {standing.goalDifference >= 0 ? '+' : ''}
                  {standing.goalDifference} sg
                </span>
              )}
              {!readOnly && (
                <span className="flex flex-col gap-0.5">
                  <button
                    className="px-2 py-0.5 text-xs leading-none rounded bg-emerald-500/10 hover:bg-emerald-500/20 disabled:opacity-30 text-emerald-100"
                    disabled={idx === 0}
                    onClick={() => onMoveUp(idx)}
                    aria-label="Mover para cima"
                  >
                    ▲
                  </button>
                  <button
                    className="px-2 py-0.5 text-xs leading-none rounded bg-emerald-500/10 hover:bg-emerald-500/20 disabled:opacity-30 text-emerald-100"
                    disabled={idx === current.length - 1}
                    onClick={() => onMoveDown(idx)}
                    aria-label="Mover para baixo"
                  >
                    ▼
                  </button>
                </span>
              )}
            </li>
          );
        })}
      </ol>
    </div>
  );
}
