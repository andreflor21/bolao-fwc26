import 'dotenv/config';
import { PrismaClient } from '@prisma/client';
import { PrismaPg } from '@prisma/adapter-pg';
import { FIFA_WC_2026_ID } from '@bolao/shared';
import { buildBracket } from '../src/domain/bracket/bracket-engine';
import type { FifaRanks, GroupMatchResult } from '../src/domain/bracket/types';
import type { GroupLetter } from '@bolao/shared';

/**
 * REPARO do estado quebrado deixado por `reset-knockout-brackets.ts` quando ele
 * DELETAVA a BracketPrediction inteira.
 *
 * Sintoma: o jogador tinha os palpites de grupo já submetidos (Guess.submittedAt
 * != null), mas sem BracketPrediction. Isso o deixava num estado morto:
 *   - submit() recusa (GROUP_ALREADY_SUBMITTED) → não recria o bracket
 *   - saveManualTiebreakOrder() recusa (GROUP_NOT_SUBMITTED) → não resolve empate
 *   - submitKnockoutGuesses() recusa → não palpita o mata-mata
 *
 * Correção: regenera a BracketPrediction a partir dos Guess já submetidos
 * (chave correta da FIFA, R32 inalterada), com o mata-mata ZERADO
 * (knockoutScores = {}, knockoutSubmittedAt = null). Preserva os palpites de
 * grupo e destrava o jogador, que então (re)faz só o mata-mata.
 *
 * Uso:
 *   npx ts-node --transpile-only prisma/repair-knockout-brackets.ts            # dry-run
 *   npx ts-node --transpile-only prisma/repair-knockout-brackets.ts --apply    # regenera no banco
 */

const APPLY = process.argv.includes('--apply');

if (!process.env.DATABASE_URL) {
  throw new Error('DATABASE_URL is required');
}

const prisma = new PrismaClient({
  adapter: new PrismaPg({ connectionString: process.env.DATABASE_URL }),
});

async function main(): Promise<void> {
  // Partidas de grupo (com códigos e ranking FIFA semente) — base do bracket.
  const groupMatches = await prisma.match.findMany({
    where: { competitionId: FIFA_WC_2026_ID, stage: 'group' },
    select: {
      id: true,
      groupLetter: true,
      homeTeam: { select: { code: true, seededRank: true } },
      awayTeam: { select: { code: true, seededRank: true } },
    },
  });
  const groupMatchIds = groupMatches.map((m) => m.id);

  // Candidatos: têm pelo menos um palpite de grupo SUBMETIDO.
  const submittedGuessUsers = await prisma.guess.findMany({
    where: { matchId: { in: groupMatchIds }, submittedAt: { not: null } },
    select: { userId: true },
    distinct: ['userId'],
  });
  const candidateIds = submittedGuessUsers.map((g) => g.userId);

  // Quem JÁ tem BracketPrediction está ok — alvo é quem NÃO tem.
  const haveBracket = await prisma.bracketPrediction.findMany({
    where: { competitionId: FIFA_WC_2026_ID, userId: { in: candidateIds } },
    select: { userId: true },
  });
  const haveSet = new Set(haveBracket.map((b) => b.userId));
  const brokenIds = candidateIds.filter((id) => !haveSet.has(id));

  const broken = await prisma.user.findMany({
    where: { id: { in: brokenIds } },
    select: { id: true, name: true, email: true },
  });

  console.log(`\n🔧 Jogadores em estado quebrado (grupos submetidos, sem bracket): ${broken.length}\n`);
  for (const u of broken) console.log(`  - ${u.name} <${u.email}>`);
  console.log('');

  if (broken.length === 0) {
    console.log('✅ Ninguém precisa de reparo.\n');
    return;
  }

  if (!APPLY) {
    console.log('ℹ️  Dry-run. Nada foi gravado. Rode com --apply para regenerar os brackets.\n');
    return;
  }

  let repaired = 0;
  for (const u of broken) {
    const guesses = await prisma.guess.findMany({
      where: { userId: u.id, matchId: { in: groupMatchIds } },
      select: { matchId: true, homeGoals: true, awayGoals: true, submittedAt: true },
    });
    const byMatch = new Map(guesses.map((g) => [g.matchId, g] as const));

    // Monta entrada do engine (mesma lógica de GuessService.computeBracket).
    const matchResults: Array<GroupMatchResult & { groupLetter: GroupLetter }> = [];
    const fifaRanks: FifaRanks = {};
    for (const m of groupMatches) {
      if (!m.homeTeam || !m.awayTeam || !m.groupLetter) continue;
      fifaRanks[m.homeTeam.code] = m.homeTeam.seededRank;
      fifaRanks[m.awayTeam.code] = m.awayTeam.seededRank;
      const g = byMatch.get(m.id);
      if (!g) continue;
      matchResults.push({
        groupLetter: m.groupLetter as GroupLetter,
        homeTeamCode: m.homeTeam.code,
        awayTeamCode: m.awayTeam.code,
        homeGoals: g.homeGoals,
        awayGoals: g.awayGoals,
      });
    }

    // Bracket recomputado com a chave OFICIAL corrigida; mata-mata zerado.
    const bracket = buildBracket({ groupMatches: matchResults, fifaRanks });

    // groupSubmittedAt = primeiro submittedAt do jogador (ou agora, fallback).
    const earliest = guesses
      .map((g) => g.submittedAt)
      .filter((d): d is Date => !!d)
      .sort((a, b) => a.getTime() - b.getTime())[0];
    const groupSubmittedAt = (earliest ?? new Date()).toISOString();

    const payload = {
      bracket,
      knockoutScores: {},
      manualTiebreakOrder: {},
      groupSubmittedAt,
      knockoutSubmittedAt: null,
    };

    await prisma.bracketPrediction.upsert({
      where: { userId_competitionId: { userId: u.id, competitionId: FIFA_WC_2026_ID } },
      create: {
        userId: u.id,
        competitionId: FIFA_WC_2026_ID,
        payload: payload as unknown as object,
        submittedAt: earliest ?? new Date(),
      },
      update: { payload: payload as unknown as object },
    });
    repaired++;
    console.log(`  ✔ ${u.name} regenerado`);
  }

  console.log(`\n✅ ${repaired} bracket(s) regenerado(s). Os jogadores já podem resolver empates e palpitar o mata-mata.\n`);
}

main()
  .catch((e) => {
    console.error('Falhou:', e instanceof Error ? e.message : e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
