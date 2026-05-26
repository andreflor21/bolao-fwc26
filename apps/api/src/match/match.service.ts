import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { FIFA_WC_2026_ID, type GroupLetter, type MatchDto } from '@bolao/shared';

@Injectable()
export class MatchService {
  constructor(private readonly prisma: PrismaService) {}

  async listGroupStage(): Promise<MatchDto[]> {
    const matches = await this.prisma.match.findMany({
      where: { competitionId: FIFA_WC_2026_ID, stage: 'group' },
      orderBy: [{ roundNumber: 'asc' }, { kickoffAt: 'asc' }],
      include: {
        homeTeam: { select: { code: true, name: true } },
        awayTeam: { select: { code: true, name: true } },
      },
    });

    return matches.map((m) => ({
      id: m.id,
      stage: 'group',
      groupLetter: (m.groupLetter ?? null) as GroupLetter | null,
      roundNumber: m.roundNumber,
      kickoffAt: m.kickoffAt.toISOString(),
      city: m.city,
      homeTeamCode: m.homeTeam?.code ?? null,
      awayTeamCode: m.awayTeam?.code ?? null,
      homeTeamName: m.homeTeam?.name ?? null,
      awayTeamName: m.awayTeam?.name ?? null,
      homeGoalsOfficial: m.homeGoalsOfficial,
      awayGoalsOfficial: m.awayGoalsOfficial,
    }));
  }
}
