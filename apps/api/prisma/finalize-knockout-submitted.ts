import 'dotenv/config';
import { PrismaClient } from '@prisma/client';
import { PrismaPg } from '@prisma/adapter-pg';
import { FIFA_WC_2026_ID } from '@bolao/shared';
import { ALL_FIXTURES } from '../src/domain/bracket/fifa-2026-bracket-map';

/**
 * SELECT + UPDATE: finaliza quem já preencheu os 32 palpites do mata-mata mas
 * ainda está com `knockoutSubmittedAt` nulo (ex.: preencheu tudo mas não clicou
 * em "Submeter", ou foi regenerado pelo reparo). Seta o `knockoutSubmittedAt`
 * pra marcar como finalizado.
 *
 * "Finalizou os 32" = o payload.knockoutScores tem entrada para TODOS os 32
 * confrontos do bracket (R32-73 … F-104).
 *
 * Uso:
 *   npx ts-node --transpile-only prisma/finalize-knockout-submitted.ts            # SELECT (dry-run): só lista
 *   npx ts-node --transpile-only prisma/finalize-knockout-submitted.ts --apply    # UPDATE: seta knockoutSubmittedAt
 */

const APPLY = process.argv.includes('--apply');

if (!process.env.DATABASE_URL) {
  throw new Error('DATABASE_URL is required');
}

const prisma = new PrismaClient({
  adapter: new PrismaPg({ connectionString: process.env.DATABASE_URL }),
});

/** Os 32 ids de confronto do mata-mata, vindos do mapa oficial do bracket. */
const ALL_FIXTURE_IDS = ALL_FIXTURES.map((f) => f.id);

interface StoredPayload {
  knockoutScores?: Record<string, unknown>;
  knockoutSubmittedAt?: string | null;
  [k: string]: unknown;
}

/** Tem palpite para os 32 confrontos? */
function hasAll32(payload: StoredPayload): boolean {
  const scores = payload.knockoutScores ?? {};
  return ALL_FIXTURE_IDS.every((id) => id in scores);
}

async function main(): Promise<void> {
  const predictions = await prisma.bracketPrediction.findMany({
    where: { competitionId: FIFA_WC_2026_ID },
    select: {
      userId: true,
      payload: true,
      user: { select: { name: true, email: true } },
    },
  });

  // Já têm os 32 preenchidos E ainda não estão marcados como submetidos.
  const pending = predictions
    .map((p) => ({ ...p, payload: (p.payload ?? {}) as StoredPayload }))
    .filter((p) => hasAll32(p.payload) && !p.payload.knockoutSubmittedAt);

  // (Informativo) quantos já estão finalizados de fato.
  const alreadyDone = predictions.filter(
    (p) => ((p.payload ?? {}) as StoredPayload).knockoutSubmittedAt,
  ).length;

  console.log(`\n📊 Brackets: ${predictions.length} · já finalizados: ${alreadyDone}`);
  console.log(`🎯 Preencheram os 32 mas SEM knockoutSubmittedAt: ${pending.length}\n`);
  for (const p of pending) {
    const filled = Object.keys(p.payload.knockoutScores ?? {}).length;
    console.log(`  - ${p.user.name} <${p.user.email}>  (${filled}/32)`);
  }
  console.log('');

  if (pending.length === 0) {
    console.log('✅ Ninguém pendente. Nada a fazer.\n');
    return;
  }

  if (!APPLY) {
    console.log('ℹ️  Dry-run (SELECT). Nada foi gravado. Rode com --apply para setar o submittedAt.\n');
    return;
  }

  const now = new Date();
  let updated = 0;
  for (const p of pending) {
    const payload: StoredPayload = {
      ...p.payload,
      knockoutSubmittedAt: now.toISOString(),
    };
    await prisma.bracketPrediction.update({
      where: { userId_competitionId: { userId: p.userId, competitionId: FIFA_WC_2026_ID } },
      data: { payload: payload as unknown as object },
    });
    updated++;
    console.log(`  ✔ ${p.user.name} finalizado`);
  }

  console.log(`\n✅ ${updated} jogador(es) marcados como finalizados (knockoutSubmittedAt = ${now.toISOString()}).\n`);
}

main()
  .catch((e) => {
    console.error('Falhou:', e instanceof Error ? e.message : e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
