import type { PrismaClient } from '@prisma/client';

/**
 * As 32 partidas do mata-mata da Copa do Mundo FIFA 2026 (jogos 73–104).
 *
 * Os times só são definidos DEPOIS que a fase de grupos termina — então aqui
 * criamos as partidas "vazias" (sem home/away), com o `bracketFixtureId` que
 * casa com o mapa em `domain/bracket/fifa-2026-bracket-map.ts`. Quando o 72º
 * resultado oficial é lançado, `KnockoutService.generateRealBracket()` resolve
 * as classificações e preenche os times reais da R32; cada rodada seguinte é
 * preenchida ao lançar os resultados.
 *
 * Datas/horários: cidades e horários locais informados pelo organizador; as
 * DATAS seguem o calendário oficial FIFA 2026 (R32 28/jun–3/jul, oitavas
 * 4–7/jul, quartas 9–11/jul, semis 14–15/jul, 3º 18/jul, final 19/jul). Como
 * são apenas cosméticas (não afetam pontuação nem premiação — o lock dos
 * palpites KO é por env), ajuste livremente aqui se necessário.
 *
 * `kickoffUtc` já convertido do horário local de cada sede para UTC.
 */

type SeedKnockout = {
  /** ID estável no mapa do bracket (R32-73 … F-104). */
  fixtureId: string;
  stage: 'r32' | 'r16' | 'qf' | 'sf' | 'tp' | 'final';
  city: string;
  /** Horário local informado (referência humana; o que vale é kickoffUtc). */
  localTime: string;
  kickoffUtc: string;
};

const KNOCKOUTS: SeedKnockout[] = [
  // ── Rodada de 32 (16 avos) — 28 jun a 3 jul ──
  { fixtureId: 'R32-73', stage: 'r32', city: 'Los Angeles', localTime: '19:00 PT', kickoffUtc: '2026-06-29T02:00:00Z' },
  { fixtureId: 'R32-74', stage: 'r32', city: 'Boston', localTime: '19:00 ET', kickoffUtc: '2026-06-28T23:00:00Z' },
  { fixtureId: 'R32-75', stage: 'r32', city: 'Monterrey', localTime: '19:00 CT', kickoffUtc: '2026-06-29T01:00:00Z' },
  { fixtureId: 'R32-76', stage: 'r32', city: 'Houston', localTime: '20:00 CT', kickoffUtc: '2026-06-30T01:00:00Z' },
  { fixtureId: 'R32-77', stage: 'r32', city: 'New York / New Jersey', localTime: '19:00 ET', kickoffUtc: '2026-06-29T23:00:00Z' },
  { fixtureId: 'R32-78', stage: 'r32', city: 'Dallas', localTime: '20:00 CT', kickoffUtc: '2026-06-30T01:00:00Z' },
  { fixtureId: 'R32-79', stage: 'r32', city: 'Cidade do México', localTime: '19:00 CT', kickoffUtc: '2026-07-01T01:00:00Z' },
  { fixtureId: 'R32-80', stage: 'r32', city: 'Vancouver', localTime: '19:00 PT', kickoffUtc: '2026-07-01T02:00:00Z' },
  { fixtureId: 'R32-81', stage: 'r32', city: 'Atlanta', localTime: '19:00 ET', kickoffUtc: '2026-06-30T23:00:00Z' },
  { fixtureId: 'R32-82', stage: 'r32', city: 'Seattle', localTime: '19:00 PT', kickoffUtc: '2026-07-02T02:00:00Z' },
  { fixtureId: 'R32-83', stage: 'r32', city: 'Toronto', localTime: '19:00 ET', kickoffUtc: '2026-07-01T23:00:00Z' },
  { fixtureId: 'R32-84', stage: 'r32', city: 'Guadalajara', localTime: '19:00 CT', kickoffUtc: '2026-07-02T01:00:00Z' },
  { fixtureId: 'R32-85', stage: 'r32', city: 'Philadelphia', localTime: '19:00 ET', kickoffUtc: '2026-07-02T23:00:00Z' },
  { fixtureId: 'R32-86', stage: 'r32', city: 'Kansas City', localTime: '19:00 CT', kickoffUtc: '2026-07-03T00:00:00Z' },
  { fixtureId: 'R32-87', stage: 'r32', city: 'Miami', localTime: '19:00 ET', kickoffUtc: '2026-07-03T23:00:00Z' },
  { fixtureId: 'R32-88', stage: 'r32', city: 'San Francisco Bay Area', localTime: '19:00 PT', kickoffUtc: '2026-07-04T02:00:00Z' },

  // ── Oitavas — 4 a 7 jul ──
  { fixtureId: 'R16-89', stage: 'r16', city: 'Houston', localTime: '19:00 CT', kickoffUtc: '2026-07-05T00:00:00Z' },
  { fixtureId: 'R16-90', stage: 'r16', city: 'Philadelphia', localTime: '19:00 ET', kickoffUtc: '2026-07-04T23:00:00Z' },
  { fixtureId: 'R16-91', stage: 'r16', city: 'Dallas', localTime: '19:00 CT', kickoffUtc: '2026-07-06T00:00:00Z' },
  { fixtureId: 'R16-92', stage: 'r16', city: 'Cidade do México', localTime: '19:00 CT', kickoffUtc: '2026-07-05T01:00:00Z' },
  { fixtureId: 'R16-93', stage: 'r16', city: 'New York / New Jersey', localTime: '19:00 ET', kickoffUtc: '2026-07-05T23:00:00Z' },
  { fixtureId: 'R16-94', stage: 'r16', city: 'Seattle', localTime: '19:00 PT', kickoffUtc: '2026-07-07T02:00:00Z' },
  { fixtureId: 'R16-95', stage: 'r16', city: 'Atlanta', localTime: '19:00 ET', kickoffUtc: '2026-07-06T23:00:00Z' },
  { fixtureId: 'R16-96', stage: 'r16', city: 'Vancouver', localTime: '19:00 PT', kickoffUtc: '2026-07-08T02:00:00Z' },

  // ── Quartas — 9 a 11 jul ──
  { fixtureId: 'QF-97', stage: 'qf', city: 'Boston', localTime: '19:00 ET', kickoffUtc: '2026-07-09T23:00:00Z' },
  { fixtureId: 'QF-98', stage: 'qf', city: 'Los Angeles', localTime: '19:00 PT', kickoffUtc: '2026-07-11T02:00:00Z' },
  { fixtureId: 'QF-99', stage: 'qf', city: 'Miami', localTime: '19:00 ET', kickoffUtc: '2026-07-10T23:00:00Z' },
  { fixtureId: 'QF-100', stage: 'qf', city: 'Kansas City', localTime: '19:00 CT', kickoffUtc: '2026-07-12T00:00:00Z' },

  // ── Semifinais — 14 e 15 jul ──
  { fixtureId: 'SF-101', stage: 'sf', city: 'Dallas', localTime: '19:00 CT', kickoffUtc: '2026-07-15T00:00:00Z' },
  { fixtureId: 'SF-102', stage: 'sf', city: 'Atlanta', localTime: '19:00 ET', kickoffUtc: '2026-07-15T23:00:00Z' },

  // ── Disputa de 3º lugar — 18 jul ──
  { fixtureId: 'TP-103', stage: 'tp', city: 'Miami', localTime: '19:00 ET', kickoffUtc: '2026-07-18T23:00:00Z' },

  // ── Final — 19 jul ──
  { fixtureId: 'F-104', stage: 'final', city: 'New York / New Jersey', localTime: '19:00 ET', kickoffUtc: '2026-07-19T23:00:00Z' },
];

export async function seedKnockoutMatches(
  prisma: PrismaClient,
  competitionId: string,
): Promise<number> {
  if (KNOCKOUTS.length !== 32) {
    throw new Error(`Expected 32 knockout fixtures, have ${KNOCKOUTS.length}`);
  }

  // Idempotente: regenera as partidas KO (sem times — preenchidas depois).
  // Em prod roda 1x no setup, antes de existirem palpites/pontuações KO.
  await prisma.match.deleteMany({
    where: { competitionId, stage: { not: 'group' } },
  });

  let count = 0;
  for (const k of KNOCKOUTS) {
    await prisma.match.create({
      data: {
        competitionId,
        stage: k.stage,
        bracketFixtureId: k.fixtureId,
        kickoffAt: new Date(k.kickoffUtc),
        city: k.city,
        // homeTeamId / awayTeamId ficam null até a fase de grupos terminar.
      },
    });
    count++;
  }
  return count;
}

export { KNOCKOUTS };
