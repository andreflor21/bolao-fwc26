import type { PrismaClient } from '@prisma/client';

// 72 jogos da fase de grupos da Copa do Mundo FIFA 2026 — tabela oficial.
// Horários originais em BRT (UTC-3); aqui armazenados em UTC.
// Cada confronto traz o time da casa primeiro, conforme listagem oficial.

type SeedMatch = {
  home: string;
  away: string;
  group: string;
  roundNumber: 1 | 2 | 3;
  kickoffUtc: string;
  city: string;
};

const MATCHES: SeedMatch[] = [
  // ── Rodada 1 (11–17 jun) ──
  { home: 'MEX', away: 'RSA', group: 'A', roundNumber: 1, kickoffUtc: '2026-06-11T19:00:00Z', city: 'Cidade do México' },
  { home: 'KOR', away: 'CZE', group: 'A', roundNumber: 1, kickoffUtc: '2026-06-12T02:00:00Z', city: 'Guadalajara' },
  { home: 'CAN', away: 'BIH', group: 'B', roundNumber: 1, kickoffUtc: '2026-06-12T19:00:00Z', city: 'Toronto' },
  { home: 'USA', away: 'PAR', group: 'D', roundNumber: 1, kickoffUtc: '2026-06-13T01:00:00Z', city: 'Los Angeles' },
  { home: 'AUS', away: 'TUR', group: 'D', roundNumber: 1, kickoffUtc: '2026-06-13T04:00:00Z', city: 'Vancouver' },
  { home: 'QAT', away: 'SUI', group: 'B', roundNumber: 1, kickoffUtc: '2026-06-13T19:00:00Z', city: 'San Francisco' },
  { home: 'BRA', away: 'MAR', group: 'C', roundNumber: 1, kickoffUtc: '2026-06-13T22:00:00Z', city: 'Nova York/NJ' },
  { home: 'HAI', away: 'SCO', group: 'C', roundNumber: 1, kickoffUtc: '2026-06-14T01:00:00Z', city: 'Boston' },
  { home: 'GER', away: 'CUR', group: 'E', roundNumber: 1, kickoffUtc: '2026-06-14T17:00:00Z', city: 'Houston' },
  { home: 'NED', away: 'JPN', group: 'F', roundNumber: 1, kickoffUtc: '2026-06-14T20:00:00Z', city: 'Dallas' },
  { home: 'CIV', away: 'ECU', group: 'E', roundNumber: 1, kickoffUtc: '2026-06-14T23:00:00Z', city: 'Philadelphia' },
  { home: 'SWE', away: 'TUN', group: 'F', roundNumber: 1, kickoffUtc: '2026-06-15T02:00:00Z', city: 'Monterrey' },
  { home: 'ESP', away: 'CPV', group: 'H', roundNumber: 1, kickoffUtc: '2026-06-15T16:00:00Z', city: 'Atlanta' },
  { home: 'BEL', away: 'EGY', group: 'G', roundNumber: 1, kickoffUtc: '2026-06-15T19:00:00Z', city: 'Seattle' },
  { home: 'SAU', away: 'URU', group: 'H', roundNumber: 1, kickoffUtc: '2026-06-15T22:00:00Z', city: 'Miami' },
  { home: 'IRN', away: 'NZL', group: 'G', roundNumber: 1, kickoffUtc: '2026-06-16T01:00:00Z', city: 'Los Angeles' },
  { home: 'AUT', away: 'JOR', group: 'J', roundNumber: 1, kickoffUtc: '2026-06-16T04:00:00Z', city: 'San Francisco' },
  { home: 'FRA', away: 'SEN', group: 'I', roundNumber: 1, kickoffUtc: '2026-06-16T19:00:00Z', city: 'Nova York/NJ' },
  { home: 'IRQ', away: 'NOR', group: 'I', roundNumber: 1, kickoffUtc: '2026-06-16T22:00:00Z', city: 'Boston' },
  { home: 'ARG', away: 'ALG', group: 'J', roundNumber: 1, kickoffUtc: '2026-06-17T01:00:00Z', city: 'Kansas City' },
  { home: 'POR', away: 'COD', group: 'K', roundNumber: 1, kickoffUtc: '2026-06-17T17:00:00Z', city: 'Houston' },
  { home: 'ENG', away: 'CRO', group: 'L', roundNumber: 1, kickoffUtc: '2026-06-17T20:00:00Z', city: 'Dallas' },
  { home: 'GHA', away: 'PAN', group: 'L', roundNumber: 1, kickoffUtc: '2026-06-17T23:00:00Z', city: 'Toronto' },
  { home: 'UZB', away: 'COL', group: 'K', roundNumber: 1, kickoffUtc: '2026-06-18T02:00:00Z', city: 'Cidade do México' },

  // ── Rodada 2 (18–23 jun) ──
  { home: 'CZE', away: 'RSA', group: 'A', roundNumber: 2, kickoffUtc: '2026-06-18T16:00:00Z', city: 'Atlanta' },
  { home: 'SUI', away: 'BIH', group: 'B', roundNumber: 2, kickoffUtc: '2026-06-18T19:00:00Z', city: 'Los Angeles' },
  { home: 'CAN', away: 'QAT', group: 'B', roundNumber: 2, kickoffUtc: '2026-06-18T22:00:00Z', city: 'Vancouver' },
  { home: 'MEX', away: 'KOR', group: 'A', roundNumber: 2, kickoffUtc: '2026-06-19T01:00:00Z', city: 'Guadalajara' },
  { home: 'TUR', away: 'PAR', group: 'D', roundNumber: 2, kickoffUtc: '2026-06-19T04:00:00Z', city: 'San Francisco' },
  { home: 'USA', away: 'AUS', group: 'D', roundNumber: 2, kickoffUtc: '2026-06-19T19:00:00Z', city: 'Seattle' },
  { home: 'SCO', away: 'MAR', group: 'C', roundNumber: 2, kickoffUtc: '2026-06-19T22:00:00Z', city: 'Boston' },
  { home: 'BRA', away: 'HAI', group: 'C', roundNumber: 2, kickoffUtc: '2026-06-20T00:30:00Z', city: 'Philadelphia' },
  { home: 'TUN', away: 'JPN', group: 'F', roundNumber: 2, kickoffUtc: '2026-06-20T04:00:00Z', city: 'Monterrey' },
  { home: 'NED', away: 'SWE', group: 'F', roundNumber: 2, kickoffUtc: '2026-06-20T17:00:00Z', city: 'Houston' },
  { home: 'GER', away: 'CIV', group: 'E', roundNumber: 2, kickoffUtc: '2026-06-20T20:00:00Z', city: 'Toronto' },
  { home: 'ECU', away: 'CUR', group: 'E', roundNumber: 2, kickoffUtc: '2026-06-21T00:00:00Z', city: 'Kansas City' },
  { home: 'ESP', away: 'SAU', group: 'H', roundNumber: 2, kickoffUtc: '2026-06-21T16:00:00Z', city: 'Atlanta' },
  { home: 'BEL', away: 'IRN', group: 'G', roundNumber: 2, kickoffUtc: '2026-06-21T19:00:00Z', city: 'Los Angeles' },
  { home: 'URU', away: 'CPV', group: 'H', roundNumber: 2, kickoffUtc: '2026-06-21T22:00:00Z', city: 'Miami' },
  { home: 'NZL', away: 'EGY', group: 'G', roundNumber: 2, kickoffUtc: '2026-06-22T01:00:00Z', city: 'Vancouver' },
  { home: 'JOR', away: 'ALG', group: 'J', roundNumber: 2, kickoffUtc: '2026-06-22T03:00:00Z', city: 'San Francisco' },
  { home: 'ARG', away: 'AUT', group: 'J', roundNumber: 2, kickoffUtc: '2026-06-22T17:00:00Z', city: 'Dallas' },
  { home: 'FRA', away: 'IRQ', group: 'I', roundNumber: 2, kickoffUtc: '2026-06-22T21:00:00Z', city: 'Philadelphia' },
  { home: 'NOR', away: 'SEN', group: 'I', roundNumber: 2, kickoffUtc: '2026-06-23T00:00:00Z', city: 'Nova York/NJ' },
  { home: 'POR', away: 'UZB', group: 'K', roundNumber: 2, kickoffUtc: '2026-06-23T17:00:00Z', city: 'Houston' },
  { home: 'ENG', away: 'GHA', group: 'L', roundNumber: 2, kickoffUtc: '2026-06-23T20:00:00Z', city: 'Boston' },
  { home: 'PAN', away: 'CRO', group: 'L', roundNumber: 2, kickoffUtc: '2026-06-23T23:00:00Z', city: 'Toronto' },
  { home: 'COL', away: 'COD', group: 'K', roundNumber: 2, kickoffUtc: '2026-06-24T02:00:00Z', city: 'Guadalajara' },

  // ── Rodada 3 (24–27 jun, jogos simultâneos por grupo) ──
  { home: 'SUI', away: 'CAN', group: 'B', roundNumber: 3, kickoffUtc: '2026-06-24T19:00:00Z', city: 'Vancouver' },
  { home: 'BIH', away: 'QAT', group: 'B', roundNumber: 3, kickoffUtc: '2026-06-24T19:00:00Z', city: 'Seattle' },
  { home: 'SCO', away: 'BRA', group: 'C', roundNumber: 3, kickoffUtc: '2026-06-24T22:00:00Z', city: 'Miami' },
  { home: 'MAR', away: 'HAI', group: 'C', roundNumber: 3, kickoffUtc: '2026-06-24T22:00:00Z', city: 'Atlanta' },
  { home: 'CZE', away: 'MEX', group: 'A', roundNumber: 3, kickoffUtc: '2026-06-25T01:00:00Z', city: 'Cidade do México' },
  { home: 'RSA', away: 'KOR', group: 'A', roundNumber: 3, kickoffUtc: '2026-06-25T01:00:00Z', city: 'Monterrey' },
  { home: 'CUR', away: 'CIV', group: 'E', roundNumber: 3, kickoffUtc: '2026-06-25T20:00:00Z', city: 'Philadelphia' },
  { home: 'ECU', away: 'GER', group: 'E', roundNumber: 3, kickoffUtc: '2026-06-25T20:00:00Z', city: 'Nova York/NJ' },
  { home: 'JPN', away: 'SWE', group: 'F', roundNumber: 3, kickoffUtc: '2026-06-25T23:00:00Z', city: 'Dallas' },
  { home: 'TUN', away: 'NED', group: 'F', roundNumber: 3, kickoffUtc: '2026-06-25T23:00:00Z', city: 'Kansas City' },
  { home: 'TUR', away: 'USA', group: 'D', roundNumber: 3, kickoffUtc: '2026-06-26T02:00:00Z', city: 'Los Angeles' },
  { home: 'PAR', away: 'AUS', group: 'D', roundNumber: 3, kickoffUtc: '2026-06-26T02:00:00Z', city: 'San Francisco' },
  { home: 'NOR', away: 'FRA', group: 'I', roundNumber: 3, kickoffUtc: '2026-06-26T19:00:00Z', city: 'Boston' },
  { home: 'SEN', away: 'IRQ', group: 'I', roundNumber: 3, kickoffUtc: '2026-06-26T19:00:00Z', city: 'Toronto' },
  { home: 'CPV', away: 'SAU', group: 'H', roundNumber: 3, kickoffUtc: '2026-06-27T00:00:00Z', city: 'Houston' },
  { home: 'URU', away: 'ESP', group: 'H', roundNumber: 3, kickoffUtc: '2026-06-27T00:00:00Z', city: 'Guadalajara' },
  { home: 'EGY', away: 'IRN', group: 'G', roundNumber: 3, kickoffUtc: '2026-06-27T03:00:00Z', city: 'Seattle' },
  { home: 'NZL', away: 'BEL', group: 'G', roundNumber: 3, kickoffUtc: '2026-06-27T03:00:00Z', city: 'Vancouver' },
  { home: 'PAN', away: 'ENG', group: 'L', roundNumber: 3, kickoffUtc: '2026-06-27T21:00:00Z', city: 'Nova York/NJ' },
  { home: 'CRO', away: 'GHA', group: 'L', roundNumber: 3, kickoffUtc: '2026-06-27T21:00:00Z', city: 'Philadelphia' },
  { home: 'COL', away: 'POR', group: 'K', roundNumber: 3, kickoffUtc: '2026-06-27T23:30:00Z', city: 'Miami' },
  { home: 'COD', away: 'UZB', group: 'K', roundNumber: 3, kickoffUtc: '2026-06-27T23:30:00Z', city: 'Atlanta' },
  { home: 'ALG', away: 'AUT', group: 'J', roundNumber: 3, kickoffUtc: '2026-06-28T02:00:00Z', city: 'Kansas City' },
  { home: 'JOR', away: 'ARG', group: 'J', roundNumber: 3, kickoffUtc: '2026-06-28T02:00:00Z', city: 'Dallas' },
];

export async function seedGroupMatches(
  prisma: PrismaClient,
  competitionId: string,
): Promise<number> {
  const teams = await prisma.team.findMany({
    where: { competitionId },
    select: { id: true, code: true },
  });
  const teamIdByCode = new Map(teams.map((t) => [t.code, t.id]));

  for (const m of MATCHES) {
    const homeId = teamIdByCode.get(m.home);
    const awayId = teamIdByCode.get(m.away);
    if (!homeId || !awayId) {
      throw new Error(`Missing team(s) in seed: ${m.home} or ${m.away}`);
    }
  }

  // Limpa partidas de grupo desta competição (idempotência): com a tabela
  // oficial fixa, regerar é sempre seguro em dev/staging. Como `Guess` tem
  // FK em cascata para Match, palpites associados serão removidos junto —
  // em produção o seed roda 1x no setup inicial, antes de existirem palpites.
  await prisma.match.deleteMany({
    where: { competitionId, stage: 'group' },
  });

  let count = 0;
  for (const m of MATCHES) {
    await prisma.match.create({
      data: {
        competitionId,
        stage: 'group',
        groupLetter: m.group,
        roundNumber: m.roundNumber,
        kickoffAt: new Date(m.kickoffUtc),
        homeTeamId: teamIdByCode.get(m.home)!,
        awayTeamId: teamIdByCode.get(m.away)!,
        city: m.city,
      },
    });
    count++;
  }

  if (count !== 72) {
    throw new Error(`Expected 72 group matches, generated ${count}`);
  }
  return count;
}

export { MATCHES };
