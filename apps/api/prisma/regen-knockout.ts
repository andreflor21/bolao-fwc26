import 'dotenv/config';
import { PrismaClient } from '@prisma/client';
import { PrismaPg } from '@prisma/adapter-pg';
import { ALL_FIXTURES, type SlotRef } from '../src/domain/bracket/fifa-2026-bracket-map';
import { seedKnockoutMatches } from './seeds/knockout-matches';

/**
 * Regenera as 32 partidas do mata-mata (jogos 73–104) a partir da topologia
 * oficial FIFA 2026 definida em `src/domain/bracket/fifa-2026-bracket-map.ts`.
 *
 * Uso:
 *   npx ts-node --transpile-only prisma/regen-knockout.ts            # só imprime o bracket (dry-run)
 *   npx ts-node --transpile-only prisma/regen-knockout.ts --apply    # imprime + regrava as partidas no banco
 *
 * Segurança: com --apply, recusa se algum confronto KO já tiver placar oficial
 * (a fase de mata-mata já começou), a menos que você passe --force.
 */

const FIFA_WC_2026_ID = 'fifa-wc-2026';

const APPLY = process.argv.includes('--apply');
const FORCE = process.argv.includes('--force');

if (!process.env.DATABASE_URL) {
  throw new Error('DATABASE_URL is required');
}

const prisma = new PrismaClient({
  adapter: new PrismaPg({ connectionString: process.env.DATABASE_URL }),
});

/** Renderiza um slot do bracket numa etiqueta legível (1A, 2B, 3[A,B,C], W(R32-74)…). */
function label(slot: SlotRef): string {
  switch (slot.kind) {
    case 'WINNER_GROUP':
      return `1${slot.group}`;
    case 'RUNNER_UP_GROUP':
      return `2${slot.group}`;
    case 'BEST_THIRD_FROM':
      return `3[${slot.allowedGroups.join(',')}]`;
    case 'WINNER_OF':
      return `W(${slot.fixtureId})`;
    case 'LOSER_OF':
      return `L(${slot.fixtureId})`;
  }
}

function printBracket(): void {
  const byStage = new Map<string, string[]>();
  for (const f of ALL_FIXTURES) {
    const line = `  ${f.id.padEnd(8)} ${label(f.topSlot).padEnd(14)} × ${label(f.bottomSlot)}`;
    const arr = byStage.get(f.stage) ?? [];
    arr.push(line);
    byStage.set(f.stage, arr);
  }
  const titles: Record<string, string> = {
    r32: 'R32 — 16-avos (J73–J88)',
    r16: 'R16 — Oitavas (J89–J96)',
    qf: 'QF — Quartas (J97–J100)',
    sf: 'SF — Semifinais (J101–J102)',
    tp: '3º lugar (J103)',
    final: 'Final (J104)',
  };
  console.log('\n🏆 Topologia do mata-mata (FIFA World Cup 2026)\n');
  for (const stage of ['r32', 'r16', 'qf', 'sf', 'tp', 'final']) {
    console.log(`${titles[stage]}`);
    for (const line of byStage.get(stage) ?? []) console.log(line);
    console.log('');
  }
  console.log(`Total: ${ALL_FIXTURES.length} confrontos.\n`);
}

async function main(): Promise<void> {
  printBracket();

  if (!APPLY) {
    console.log('ℹ️  Dry-run. Nada foi gravado. Rode com --apply para regerar as partidas no banco.\n');
    return;
  }

  const playedKo = await prisma.match.count({
    where: {
      competitionId: FIFA_WC_2026_ID,
      stage: { not: 'group' },
      homeGoalsOfficial: { not: null },
    },
  });
  if (playedKo > 0 && !FORCE) {
    throw new Error(
      `Existem ${playedKo} confronto(s) de mata-mata com placar oficial. ` +
        `Regerar apagaria esses resultados. Use --force se realmente quiser.`,
    );
  }

  const count = await seedKnockoutMatches(prisma, FIFA_WC_2026_ID);
  console.log(`✅ ${count} partidas de mata-mata regeradas no banco.`);
  console.log(
    'ℹ️  Os times de cada confronto são resolvidos depois, ao gerar o bracket real ' +
      '(admin → generateRealBracket) ou ao lançar cada resultado oficial.\n',
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
