import { useMemo, useState } from 'react';
import type { RankingEvolutionDto } from '@bolao/shared';

type Metric = 'points' | 'position';

const GOLD = '#fcd34d'; // você
const EMERALD = '#34d399'; // perfil acessado

interface Line {
  name: string;
  values: number[];
  color: string;
  self: boolean;
}

/**
 * Gráfico de evolução no ranking geral, jogo a jogo. SVG inline (sem novas
 * dependências) com duas linhas: a do solicitante (dourada) e a do perfil
 * acessado (verde). No próprio perfil mostra só uma linha.
 *
 * Alterna entre duas métricas:
 *  - "Pontos": pontos acumulados (eixo Y normal, maior = melhor).
 *  - "Posição": posição no ranking (eixo invertido, 1 no topo).
 */
export function RankingEvolutionChart({ data }: { data: RankingEvolutionDto }) {
  const [metric, setMetric] = useState<Metric>('points');
  const n = data.checkpoints.length;

  const lines = useMemo<Line[]>(() => {
    const pick = (s: { points: number[]; position: number[] }) =>
      metric === 'points' ? s.points : s.position;
    const out: Line[] = [
      // O perfil acessado é sempre a linha verde; quando é o próprio dono,
      // essa é a única linha (e representa "você").
      {
        name: data.isSelf ? `${data.targetName} (você)` : data.targetName,
        values: pick(data.target),
        color: data.isSelf ? GOLD : EMERALD,
        self: data.isSelf,
      },
    ];
    if (!data.isSelf && data.self) {
      out.unshift({
        name: `${data.selfName} (você)`,
        values: pick(data.self),
        color: GOLD,
        self: true,
      });
    }
    return out;
  }, [data, metric]);

  if (n === 0) {
    return (
      <p className="text-sm text-emerald-200/60">
        Ainda não há jogos encerrados para montar a evolução. Volte depois das primeiras rodadas.
      </p>
    );
  }

  // Geometria do gráfico.
  const W = 700;
  const H = 300;
  const padL = 34;
  const padR = 12;
  const padT = 14;
  const padB = 36;

  const allValues = lines.flatMap((l) => l.values);
  const inverted = metric === 'position';
  // Pontos: 0..max. Posição: 1..totalPlayers (invertido, 1 no topo).
  const minV = inverted ? 1 : 0;
  const maxV = inverted
    ? Math.max(data.totalPlayers, ...allValues, 1)
    : Math.max(...allValues, 5);

  // Mostra no máximo ~12 rótulos no eixo X, independente do nº de jogos.
  const xStep = Math.max(1, Math.ceil(n / 12));
  const x = (i: number) => padL + (i * (W - padL - padR)) / Math.max(n - 1, 1);
  const y = (v: number) => {
    const t = (v - minV) / Math.max(maxV - minV, 1);
    // No modo posição, 1 (melhor) fica no topo → inverte o t.
    const tt = inverted ? t : 1 - t;
    return padT + tt * (H - padT - padB);
  };

  const yTicks = 4;
  const ticks = Array.from({ length: yTicks + 1 }, (_, t) =>
    Math.round(minV + ((maxV - minV) * t) / yTicks),
  );

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div className="flex gap-2">
          <MetricBtn active={metric === 'points'} onClick={() => setMetric('points')}>
            Pontos
          </MetricBtn>
          <MetricBtn active={metric === 'position'} onClick={() => setMetric('position')}>
            Posição
          </MetricBtn>
        </div>
        <div className="flex gap-4 text-xs text-emerald-100/85">
          {lines.map((l) => (
            <span key={l.name} className="inline-flex items-center gap-1.5">
              <span
                className="inline-block w-2.5 h-2.5 rounded-full"
                style={{ background: l.color }}
              />
              {l.name}
            </span>
          ))}
        </div>
      </div>

      <div className="rounded-xl border border-emerald-500/15 bg-midnight-900/40 p-3">
        <svg viewBox={`0 0 ${W} ${H}`} width="100%" className="block">
          {/* grade + rótulos do eixo Y */}
          {ticks.map((val) => {
            const gy = y(val);
            return (
              <g key={val}>
                <line
                  x1={padL}
                  y1={gy}
                  x2={W - padR}
                  y2={gy}
                  stroke="rgba(255,255,255,0.06)"
                />
                <text
                  x={padL - 6}
                  y={gy + 3}
                  textAnchor="end"
                  fontSize="10"
                  fill="rgba(167,243,208,0.55)"
                >
                  {inverted ? `${val}º` : val}
                </text>
              </g>
            );
          })}

          {/* rótulos do eixo X: número do jogo (1 a 104). Mostra ~12 ticks
              espaçados para não poluir quando há muitos jogos. */}
          {data.checkpoints.map((c, i) =>
            i % xStep === 0 || i === n - 1 ? (
              <text
                key={i}
                x={x(i)}
                y={H - padB + 16}
                textAnchor="middle"
                fontSize="9"
                fill="rgba(167,243,208,0.5)"
              >
                {c.gameNumber}
              </text>
            ) : null,
          )}
          <text
            x={(padL + W - padR) / 2}
            y={H - 4}
            textAnchor="middle"
            fontSize="9"
            fill="rgba(167,243,208,0.4)"
          >
            nº do jogo
          </text>

          {/* linhas + pontos */}
          {lines.map((l) => {
            const d = l.values
              .map((v, i) => `${i === 0 ? 'M' : 'L'}${x(i).toFixed(1)},${y(v).toFixed(1)}`)
              .join(' ');
            return (
              <g key={l.name}>
                <path
                  d={d}
                  fill="none"
                  stroke={l.color}
                  strokeWidth={2.5}
                  strokeLinejoin="round"
                  strokeLinecap="round"
                />
                {l.values.map((v, i) => (
                  <circle
                    key={i}
                    cx={x(i)}
                    cy={y(v)}
                    r={3.5}
                    fill="#0b1d2a"
                    stroke={l.color}
                    strokeWidth={2}
                  >
                    <title>
                      {l.name} · Jogo {data.checkpoints[i]?.gameNumber} (
                      {data.checkpoints[i]?.label}):{' '}
                      {metric === 'points' ? `${v} pts` : `${v}º lugar`}
                    </title>
                  </circle>
                ))}
              </g>
            );
          })}
        </svg>
      </div>

      <p className="text-[11px] text-emerald-200/55">
        Eixo X: número do jogo no calendário (1 a 104), apenas os já encerrados.{' '}
        {metric === 'points'
          ? 'Eixo Y: pontos acumulados no ranking geral.'
          : `Eixo Y: posição no ranking geral (1º no topo, de ${data.totalPlayers} participantes).`}{' '}
        Passe o mouse sobre os pontos para ver o detalhe de cada jogo.
      </p>
    </div>
  );
}

function MetricBtn({
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
        'px-3 py-1.5 text-xs font-semibold rounded-full border transition ' +
        (active
          ? 'border-gold-400 bg-gold-400/15 text-gold-200'
          : 'border-emerald-500/25 bg-emerald-500/5 text-emerald-200/70 hover:text-emerald-100')
      }
    >
      {children}
    </button>
  );
}
