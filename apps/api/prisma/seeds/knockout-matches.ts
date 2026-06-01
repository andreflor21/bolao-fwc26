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
 * Datas, sedes e horários locais oficiais informados pelo organizador.
 * `kickoffUtc` é a conversão do horário local de cada sede para UTC, usando
 * o fuso de verão de jun/jul 2026:
 *   Pacífico (LA, Seattle, Vancouver, SF) = UTC-7 (PDT)
 *   Central  (Houston, Dallas, Kansas City) = UTC-5 (CDT)
 *   Leste    (Boston, NY/NJ, Atlanta, Toronto, Miami, Philadelphia) = UTC-4 (EDT)
 *   México   (Monterrey, Cidade do México) = UTC-6 (sem horário de verão)
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
  { fixtureId: 'R32-73', stage: 'r32', city: 'Los Angeles', localTime: '28/06 15:00 PT', kickoffUtc: '2026-06-28T22:00:00Z' },
  { fixtureId: 'R32-74', stage: 'r32', city: 'Boston', localTime: '29/06 16:30 ET', kickoffUtc: '2026-06-29T20:30:00Z' },
  { fixtureId: 'R32-75', stage: 'r32', city: 'Monterrey', localTime: '29/06 21:00 MX', kickoffUtc: '2026-06-30T03:00:00Z' },
  { fixtureId: 'R32-76', stage: 'r32', city: 'Houston', localTime: '29/06 13:00 CT', kickoffUtc: '2026-06-29T18:00:00Z' },
  { fixtureId: 'R32-77', stage: 'r32', city: 'New York / New Jersey', localTime: '30/06 17:00 ET', kickoffUtc: '2026-06-30T21:00:00Z' },
  { fixtureId: 'R32-78', stage: 'r32', city: 'Dallas', localTime: '30/06 13:00 CT', kickoffUtc: '2026-06-30T18:00:00Z' },
  { fixtureId: 'R32-79', stage: 'r32', city: 'Cidade do México', localTime: '30/06 21:00 MX', kickoffUtc: '2026-07-01T03:00:00Z' },
  { fixtureId: 'R32-80', stage: 'r32', city: 'Atlanta', localTime: '01/07 12:00 ET', kickoffUtc: '2026-07-01T16:00:00Z' },
  { fixtureId: 'R32-81', stage: 'r32', city: 'San Francisco Bay Area', localTime: '01/07 20:00 PT', kickoffUtc: '2026-07-02T03:00:00Z' },
  { fixtureId: 'R32-82', stage: 'r32', city: 'Seattle', localTime: '01/07 16:00 PT', kickoffUtc: '2026-07-01T23:00:00Z' },
  { fixtureId: 'R32-83', stage: 'r32', city: 'Toronto', localTime: '02/07 19:00 ET', kickoffUtc: '2026-07-02T23:00:00Z' },
  { fixtureId: 'R32-84', stage: 'r32', city: 'Los Angeles', localTime: '02/07 15:00 PT', kickoffUtc: '2026-07-02T22:00:00Z' },
  { fixtureId: 'R32-85', stage: 'r32', city: 'Vancouver', localTime: '02/07 23:00 PT', kickoffUtc: '2026-07-03T06:00:00Z' },
  { fixtureId: 'R32-86', stage: 'r32', city: 'Miami', localTime: '03/07 18:00 ET', kickoffUtc: '2026-07-03T22:00:00Z' },
  { fixtureId: 'R32-87', stage: 'r32', city: 'Kansas City', localTime: '03/07 21:30 CT', kickoffUtc: '2026-07-04T02:30:00Z' },
  { fixtureId: 'R32-88', stage: 'r32', city: 'Dallas', localTime: '03/07 14:00 CT', kickoffUtc: '2026-07-03T19:00:00Z' },

  // ── Oitavas — 4 a 7 jul ──
  { fixtureId: 'R16-89', stage: 'r16', city: 'Philadelphia', localTime: '04/07 17:00 ET', kickoffUtc: '2026-07-04T21:00:00Z' },
  { fixtureId: 'R16-90', stage: 'r16', city: 'Houston', localTime: '04/07 13:00 CT', kickoffUtc: '2026-07-04T18:00:00Z' },
  { fixtureId: 'R16-91', stage: 'r16', city: 'New York / New Jersey', localTime: '05/07 16:00 ET', kickoffUtc: '2026-07-05T20:00:00Z' },
  { fixtureId: 'R16-92', stage: 'r16', city: 'Cidade do México', localTime: '05/07 20:00 MX', kickoffUtc: '2026-07-06T02:00:00Z' },
  { fixtureId: 'R16-93', stage: 'r16', city: 'Dallas', localTime: '06/07 15:00 CT', kickoffUtc: '2026-07-06T20:00:00Z' },
  { fixtureId: 'R16-94', stage: 'r16', city: 'Seattle', localTime: '06/07 20:00 PT', kickoffUtc: '2026-07-07T03:00:00Z' },
  { fixtureId: 'R16-95', stage: 'r16', city: 'Atlanta', localTime: '07/07 12:00 ET', kickoffUtc: '2026-07-07T16:00:00Z' },
  { fixtureId: 'R16-96', stage: 'r16', city: 'Vancouver', localTime: '07/07 16:00 PT', kickoffUtc: '2026-07-07T23:00:00Z' },

  // ── Quartas — 9 a 11 jul ──
  { fixtureId: 'QF-97', stage: 'qf', city: 'Boston', localTime: '09/07 16:00 ET', kickoffUtc: '2026-07-09T20:00:00Z' },
  { fixtureId: 'QF-98', stage: 'qf', city: 'Los Angeles', localTime: '10/07 15:00 PT', kickoffUtc: '2026-07-10T22:00:00Z' },
  { fixtureId: 'QF-99', stage: 'qf', city: 'Miami', localTime: '11/07 17:00 ET', kickoffUtc: '2026-07-11T21:00:00Z' },
  { fixtureId: 'QF-100', stage: 'qf', city: 'Kansas City', localTime: '11/07 21:00 CT', kickoffUtc: '2026-07-12T02:00:00Z' },

  // ── Semifinais — 14 e 15 jul ──
  { fixtureId: 'SF-101', stage: 'sf', city: 'Dallas', localTime: '14/07 15:00 CT', kickoffUtc: '2026-07-14T20:00:00Z' },
  { fixtureId: 'SF-102', stage: 'sf', city: 'Atlanta', localTime: '15/07 15:00 ET', kickoffUtc: '2026-07-15T19:00:00Z' },

  // ── Disputa de 3º lugar — 18 jul ──
  { fixtureId: 'TP-103', stage: 'tp', city: 'Miami', localTime: '18/07 17:00 ET', kickoffUtc: '2026-07-18T21:00:00Z' },

  // ── Final — 19 jul ──
  { fixtureId: 'F-104', stage: 'final', city: 'New York / New Jersey', localTime: '19/07 15:00 ET', kickoffUtc: '2026-07-19T19:00:00Z' },
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
