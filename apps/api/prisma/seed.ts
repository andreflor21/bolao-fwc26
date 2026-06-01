import 'dotenv/config';
import { PrismaClient } from '@prisma/client';
import { PrismaPg } from '@prisma/adapter-pg';
import { seedTeams } from './seeds/teams';
import { seedGroupMatches } from './seeds/matches';
import { seedKnockoutMatches } from './seeds/knockout-matches';

if (!process.env.DATABASE_URL) {
  throw new Error('DATABASE_URL is required to run seed');
}
const prisma = new PrismaClient({
  adapter: new PrismaPg({ connectionString: process.env.DATABASE_URL }),
});

const FIFA_WC_2026_ID = 'fifa-wc-2026';

async function main() {
  console.log('🌱 Seeding Bolão Copa 2026...');

  const competition = await prisma.competition.upsert({
    where: { id: FIFA_WC_2026_ID },
    update: {},
    create: {
      id: FIFA_WC_2026_ID,
      name: 'Copa do Mundo FIFA 2026',
      locksAt: new Date(process.env.COMPETITION_LOCKS_AT ?? '2026-06-11T19:00:00Z'),
      endsAt: new Date(process.env.COMPETITION_ENDS_AT ?? '2026-07-19T23:59:59Z'),
      closureStatus: 'open',
      prizeDistribution: {
        first: 0.45,
        second: 0.2,
        third: 0.12,
        fourth: 0.08,
        fifth: 0.05,
        exact_score_king: 0.05,
        admin: 0.05,
      },
    },
  });
  console.log(`  ✔ Competition: ${competition.name}`);

  const teamCount = await seedTeams(prisma, competition.id);
  console.log(`  ✔ Teams: ${teamCount}`);

  const matchCount = await seedGroupMatches(prisma, competition.id);
  console.log(`  ✔ Group matches: ${matchCount}`);

  const knockoutCount = await seedKnockoutMatches(prisma, competition.id);
  console.log(`  ✔ Knockout matches: ${knockoutCount}`);

  console.log('✅ Seed completo');
}

main()
  .catch((e) => {
    console.error('Seed failed:', e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
