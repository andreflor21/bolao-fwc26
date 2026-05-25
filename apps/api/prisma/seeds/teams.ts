import type { PrismaClient } from '@prisma/client';

// 48 seleções da Copa do Mundo FIFA 2026 — grupos definidos no sorteio oficial de dezembro/2025.
// Anfitriões (MEX, CAN, USA) cabeças de chave nos grupos A, B, D respectivamente.
type SeedTeam = {
  code: string;
  name: string;
  groupLetter: string;
  seededRank: number;
};

const TEAMS: SeedTeam[] = [
  // Group A
  { code: 'MEX', name: 'México',              groupLetter: 'A', seededRank: 14 },
  { code: 'RSA', name: 'África do Sul',       groupLetter: 'A', seededRank: 53 },
  { code: 'KOR', name: 'Coreia do Sul',       groupLetter: 'A', seededRank: 22 },
  { code: 'CZE', name: 'Chéquia',             groupLetter: 'A', seededRank: 42 },

  // Group B
  { code: 'CAN', name: 'Canadá',              groupLetter: 'B', seededRank: 31 },
  { code: 'SUI', name: 'Suíça',               groupLetter: 'B', seededRank: 19 },
  { code: 'QAT', name: 'Catar',               groupLetter: 'B', seededRank: 53 },
  { code: 'BIH', name: 'Bósnia e Herzegovina',groupLetter: 'B', seededRank: 76 },

  // Group C
  { code: 'BRA', name: 'Brasil',              groupLetter: 'C', seededRank: 5 },
  { code: 'MAR', name: 'Marrocos',            groupLetter: 'C', seededRank: 12 },
  { code: 'HAI', name: 'Haiti',               groupLetter: 'C', seededRank: 83 },
  { code: 'SCO', name: 'Escócia',             groupLetter: 'C', seededRank: 39 },

  // Group D
  { code: 'USA', name: 'Estados Unidos',      groupLetter: 'D', seededRank: 16 },
  { code: 'PAR', name: 'Paraguai',            groupLetter: 'D', seededRank: 41 },
  { code: 'AUS', name: 'Austrália',           groupLetter: 'D', seededRank: 26 },
  { code: 'TUR', name: 'Turquia',             groupLetter: 'D', seededRank: 27 },

  // Group E
  { code: 'GER', name: 'Alemanha',            groupLetter: 'E', seededRank: 9 },
  { code: 'CUR', name: 'Curaçao',             groupLetter: 'E', seededRank: 82 },
  { code: 'CIV', name: 'Costa do Marfim',     groupLetter: 'E', seededRank: 40 },
  { code: 'ECU', name: 'Equador',             groupLetter: 'E', seededRank: 24 },

  // Group F
  { code: 'NED', name: 'Holanda',             groupLetter: 'F', seededRank: 7 },
  { code: 'JPN', name: 'Japão',               groupLetter: 'F', seededRank: 18 },
  { code: 'TUN', name: 'Tunísia',             groupLetter: 'F', seededRank: 49 },
  { code: 'SWE', name: 'Suécia',              groupLetter: 'F', seededRank: 44 },

  // Group G
  { code: 'BEL', name: 'Bélgica',             groupLetter: 'G', seededRank: 8 },
  { code: 'EGY', name: 'Egito',               groupLetter: 'G', seededRank: 33 },
  { code: 'IRN', name: 'Irã',                 groupLetter: 'G', seededRank: 20 },
  { code: 'NZL', name: 'Nova Zelândia',       groupLetter: 'G', seededRank: 89 },

  // Group H
  { code: 'ESP', name: 'Espanha',             groupLetter: 'H', seededRank: 3 },
  { code: 'CPV', name: 'Cabo Verde',          groupLetter: 'H', seededRank: 71 },
  { code: 'SAU', name: 'Arábia Saudita',      groupLetter: 'H', seededRank: 58 },
  { code: 'URU', name: 'Uruguai',             groupLetter: 'H', seededRank: 15 },

  // Group I
  { code: 'FRA', name: 'França',              groupLetter: 'I', seededRank: 2 },
  { code: 'SEN', name: 'Senegal',             groupLetter: 'I', seededRank: 17 },
  { code: 'NOR', name: 'Noruega',             groupLetter: 'I', seededRank: 35 },
  { code: 'IRQ', name: 'Iraque',              groupLetter: 'I', seededRank: 57 },

  // Group J
  { code: 'ARG', name: 'Argentina',           groupLetter: 'J', seededRank: 1 },
  { code: 'ALG', name: 'Argélia',             groupLetter: 'J', seededRank: 36 },
  { code: 'AUT', name: 'Áustria',             groupLetter: 'J', seededRank: 25 },
  { code: 'JOR', name: 'Jordânia',            groupLetter: 'J', seededRank: 70 },

  // Group K
  { code: 'POR', name: 'Portugal',            groupLetter: 'K', seededRank: 6 },
  { code: 'UZB', name: 'Uzbequistão',         groupLetter: 'K', seededRank: 57 },
  { code: 'COL', name: 'Colômbia',            groupLetter: 'K', seededRank: 13 },
  { code: 'COD', name: 'RD Congo',            groupLetter: 'K', seededRank: 60 },

  // Group L
  { code: 'ENG', name: 'Inglaterra',          groupLetter: 'L', seededRank: 4 },
  { code: 'CRO', name: 'Croácia',             groupLetter: 'L', seededRank: 10 },
  { code: 'GHA', name: 'Gana',                groupLetter: 'L', seededRank: 73 },
  { code: 'PAN', name: 'Panamá',              groupLetter: 'L', seededRank: 38 },
];

export async function seedTeams(prisma: PrismaClient, competitionId: string): Promise<number> {
  for (const t of TEAMS) {
    await prisma.team.upsert({
      where: { competitionId_code: { competitionId, code: t.code } },
      update: { name: t.name, groupLetter: t.groupLetter, seededRank: t.seededRank },
      create: { ...t, competitionId },
    });
  }
  return TEAMS.length;
}

export { TEAMS };
