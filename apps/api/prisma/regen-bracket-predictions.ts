import 'dotenv/config';
import { PrismaClient } from '@prisma/client';
import { PrismaPg } from '@prisma/adapter-pg';
import type { GroupLetter, BracketFixtureDto } from '@bolao/shared';
import { buildBracket } from '../src/domain/bracket/bracket-engine';
import type { GroupMatchResult, FifaRanks } from '../src/domain/bracket/types';

/**
 * Reprocessa os palpites de mata-mata gravados (`bracket_predictions.payload`)
 * com o motor JÁ CORRIGIDO (Anexo C). Cada palpite guarda um SNAPSHOT do
 * bracket (`payload.bracket`) que foi calculado pelo `buildBracket` na época da
 * submissão — quando o `assignThirdsToSlots()` ainda emparelhava os melhores 3º
 * por backtracking arbitrário. Este script recalcula esse snapshot a partir das
 * MESMAS entradas do usuário (palpites de grupo + `knockoutScores` +
 * `manualTiebreakOrder`), trocando só o resultado.
 *
 * O que NÃO é tocado:
 *   - `knockoutScores`, `manualTiebreakOrder`, `groupSubmittedAt`,
 *     `knockoutSubmittedAt` e a coluna `submittedAt` (preservados).
 *   - A pontuação de KO (`knockout_guess_scores`): ela é materializada ao lançar
 *     cada resultado oficial; reprocessá-la é um passo separado (ver nota final).
 *   - O bracket OFICIAL (tabela `matches`): regenere pelo admin
 *     (`generateRealBracket`), que já usa o motor corrigido.
 *
 * Uso:
 *   npx ts-node --transpile-only prisma/regen-bracket-predictions.ts          # dry-run (não grava)
 *   npx ts-node --transpile-only prisma/regen-bracket-predictions.ts --apply  # grava os snapshots que mudaram
 *
 * Seguro por padrão: sem `--apply` apenas relata o que mudaria.
 */

const FIFA_WC_2026_ID = 'fifa-wc-2026';

/** Os 8 confrontos da R32 cujo slot inferior é um melhor-3º (Anexo C). */
const BEST_THIRD_FIXTURES = [
  'R32-74',
  'R32-77',
  'R32-79',
  'R32-80',
  'R32-81',
  'R32-82',
  'R32-85',
  'R32-87',
];

const APPLY = process.argv.includes('--apply');

if (!process.env.DATABASE_URL) {
  throw new Error('DATABASE_URL is required');
}

const prisma = new PrismaClient({
  adapter: new PrismaPg({ connectionString: process.env.DATABASE_URL }),
});

interface StoredBracketPayload {
  bracket: { fixtures: BracketFixtureDto[]; [k: string]: unknown };
  knockoutScores?: Record<string, { homeGoals: number; awayGoals: number; advancesTeamCode?: string | null }>;
  manualTiebreakOrder?: Partial<Record<GroupLetter, string[]>>;
  [k: string]: unknown;
}

/** Normaliza o payload (lida com o formato legado pré-KO, sem wrapper). */
function parsePayload(raw: unknown): StoredBracketPayload | null {
  if (!raw || typeof raw !== 'object') return null;
  // Legado: o payload ERA o BracketPreviewDto direto (tem `fixtures`, sem `bracket`).
  if ('fixtures' in raw && !('bracket' in raw)) {
    return { bracket: raw as StoredBracketPayload['bracket'] };
  }
  if (!('bracket' in raw)) return null;
  return raw as StoredBracketPayload;
}

interface GroupMatchRow {
  id: string;
  groupLetter: string | null;
  homeTeam: { code: string; seededRank: number } | null;
  awayTeam: { code: string; seededRank: number } | null;
}

/** Reconstrói o bracket de um usuário a partir das mesmas entradas. */
function recompute(
  matches: GroupMatchRow[],
  guessByMatchId: Map<string, { homeGoals: number; awayGoals: number }>,
  payload: StoredBracketPayload,
) {
  const groupMatches: Array<GroupMatchResult & { groupLetter: GroupLetter }> = [];
  const fifaRanks: FifaRanks = {};
  for (const m of matches) {
    if (!m.homeTeam || !m.awayTeam || !m.groupLetter) continue;
    fifaRanks[m.homeTeam.code] = m.homeTeam.seededRank;
    fifaRanks[m.awayTeam.code] = m.awayTeam.seededRank;
    const guess = guessByMatchId.get(m.id);
    if (!guess) continue;
    groupMatches.push({
      groupLetter: m.groupLetter as GroupLetter,
      homeTeamCode: m.homeTeam.code,
      awayTeamCode: m.awayTeam.code,
      homeGoals: guess.homeGoals,
      awayGoals: guess.awayGoals,
    });
  }
  return buildBracket({
    groupMatches,
    fifaRanks,
    knockoutScores: payload.knockoutScores ?? {},
    manualTiebreakOrder: payload.manualTiebreakOrder ?? {},
  });
}

interface UserDiff {
  userId: string;
  name: string | null;
  thirdChanges: Array<{ fixtureId: string; from: string | null; to: string | null }>;
  totalFixtureChanges: number;
}

async function main(): Promise<void> {
  console.log(`\n🔧 Reprocessando palpites de mata-mata (Anexo C)${APPLY ? ' — MODO APPLY' : ' — dry-run'}\n`);

  const groupMatches = await prisma.match.findMany({
    where: { competitionId: FIFA_WC_2026_ID, stage: 'group' },
    select: {
      id: true,
      groupLetter: true,
      homeTeam: { select: { code: true, seededRank: true } },
      awayTeam: { select: { code: true, seededRank: true } },
    },
  });

  // Guarda global: sem as partidas de grupo é impossível reconstruir os
  // brackets — recalcular produziria snapshots VAZIOS. Aborta antes de tocar
  // em qualquer coisa para nunca degradar os palpites gravados.
  if (groupMatches.length === 0) {
    throw new Error(
      'Nenhuma partida de fase de grupos encontrada para fifa-wc-2026. ' +
        'Sem elas o recálculo zeraria os brackets. Rode este script no ambiente ' +
        'com os dados completos (partidas + palpites de grupo).',
    );
  }

  const predictions = await prisma.bracketPrediction.findMany({
    where: { competitionId: FIFA_WC_2026_ID },
    select: {
      userId: true,
      payload: true,
      user: { select: { name: true } },
    },
  });

  console.log(`Encontrados ${predictions.length} palpite(s) de bracket.\n`);

  const diffs: UserDiff[] = [];
  const degraded: Array<{ userId: string; name: string | null; oldThirds: number; newThirds: number }> = [];
  let skipped = 0;
  let updated = 0;

  for (const p of predictions) {
    const payload = parsePayload(p.payload);
    if (!payload?.bracket?.fixtures?.length) {
      skipped++;
      continue;
    }

    const userGuesses = await prisma.guess.findMany({
      where: { userId: p.userId, matchId: { in: groupMatches.map((m) => m.id) } },
      select: { matchId: true, homeGoals: true, awayGoals: true },
    });
    const guessByMatchId = new Map(
      userGuesses.map((g) => [g.matchId, { homeGoals: g.homeGoals, awayGoals: g.awayGoals }] as const),
    );

    const recomputed = recompute(groupMatches, guessByMatchId, payload);

    const oldById = new Map(payload.bracket.fixtures.map((f) => [f.id, f]));
    const newById = new Map(recomputed.fixtures.map((f) => [f.id, f]));

    // Guarda por usuário: nunca trocar um snapshot por um MENOS completo. Se o
    // recálculo resolve menos melhores-3º que o snapshot atual (entradas do
    // usuário não reproduzíveis agora), pula e avisa em vez de degradar.
    const oldThirds = BEST_THIRD_FIXTURES.filter((fx) => oldById.get(fx)?.bottomTeamCode).length;
    const newThirds = BEST_THIRD_FIXTURES.filter((fx) => newById.get(fx)?.bottomTeamCode).length;
    if (newThirds < oldThirds) {
      degraded.push({ userId: p.userId, name: p.user?.name ?? null, oldThirds, newThirds });
      continue;
    }

    // Diferenças nos 8 confrontos de melhor-3º (slot inferior).
    const thirdChanges: UserDiff['thirdChanges'] = [];
    for (const fx of BEST_THIRD_FIXTURES) {
      const before = oldById.get(fx)?.bottomTeamCode ?? null;
      const after = newById.get(fx)?.bottomTeamCode ?? null;
      if (before !== after) thirdChanges.push({ fixtureId: fx, from: before, to: after });
    }

    // Mudanças totais (inclui propagação R16+ quando há knockoutScores).
    let totalFixtureChanges = 0;
    for (const [id, nf] of newById) {
      const of = oldById.get(id);
      if (
        of?.topTeamCode !== nf.topTeamCode ||
        of?.bottomTeamCode !== nf.bottomTeamCode ||
        of?.predictedWinnerCode !== nf.predictedWinnerCode ||
        of?.predictedLoserCode !== nf.predictedLoserCode
      ) {
        totalFixtureChanges++;
      }
    }

    if (totalFixtureChanges === 0) continue;

    diffs.push({
      userId: p.userId,
      name: p.user?.name ?? null,
      thirdChanges,
      totalFixtureChanges,
    });

    if (APPLY) {
      const nextPayload = { ...payload, bracket: recomputed };
      await prisma.bracketPrediction.update({
        where: { userId_competitionId: { userId: p.userId, competitionId: FIFA_WC_2026_ID } },
        data: { payload: nextPayload as unknown as object },
      });
      updated++;
    }
  }

  // Relatório.
  diffs.sort((a, b) => b.thirdChanges.length - a.thirdChanges.length);
  for (const d of diffs) {
    const head = `• ${d.name ?? '(sem nome)'} [${d.userId}] — ${d.thirdChanges.length} slot(s) de 3º, ${d.totalFixtureChanges} confronto(s) no total`;
    console.log(head);
    for (const c of d.thirdChanges) {
      console.log(`    ${c.fixtureId}: 3º ${c.from ?? '∅'} → ${c.to ?? '∅'}`);
    }
  }

  if (degraded.length > 0) {
    console.log('\n⚠️  PULADOS (recálculo menos completo que o snapshot — não sobrescritos):');
    for (const d of degraded) {
      console.log(`    ${d.name ?? '(sem nome)'} [${d.userId}] — 3º: ${d.oldThirds} → ${d.newThirds}`);
    }
  }

  console.log('\n──────────────────────────────────────────────');
  console.log(`Palpites analisados : ${predictions.length}`);
  console.log(`Sem snapshot/ignorados: ${skipped}`);
  console.log(`Pulados (degradaria): ${degraded.length}`);
  console.log(`Afetados            : ${diffs.length}`);
  console.log(
    `Com slot de 3º trocado: ${diffs.filter((d) => d.thirdChanges.length > 0).length}`,
  );
  if (APPLY) {
    console.log(`✅ Gravados          : ${updated}`);
  } else {
    console.log('ℹ️  Dry-run — nada gravado. Rode com --apply para persistir.');
  }
  console.log('');
  console.log(
    'Nota: a pontuação de KO (knockout_guess_scores) é recalculada ao lançar/relançar\n' +
      'os resultados oficiais; e o bracket OFICIAL (matches) deve ser regerado pelo admin\n' +
      '(generateRealBracket), que já usa o motor corrigido.\n',
  );
}

main()
  .catch((e) => {
    console.error('Falhou:', e instanceof Error ? e.message : e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
