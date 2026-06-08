import { ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PrismaService } from '../prisma/prisma.service';
import { FIFA_WC_2026_ID } from '@bolao/shared';

/** Antecedência da trava geral: 1h antes do apito do primeiro jogo da Copa. */
const LOCK_LEAD_MS = 60 * 60 * 1000;

@Injectable()
export class CompetitionService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly config: ConfigService,
  ) {}

  async getMain() {
    const competition = await this.prisma.competition.findUnique({
      where: { id: FIFA_WC_2026_ID },
    });
    if (!competition) throw new NotFoundException('Competition not initialized — run seed');
    return competition;
  }

  /**
   * TRAVA GERAL — vale para TODOS os 104 jogos (fase de grupos + mata-mata).
   * É 1h antes do apito do primeiro jogo da Copa. `competition.locksAt` guarda
   * o horário do primeiro jogo (vindo de COMPETITION_LOCKS_AT); a trava é esse
   * horário menos 1h. Depois disso, nenhum palpite (grupo ou mata-mata) pode
   * ser enviado ou alterado.
   */
  async getLockAt(): Promise<Date> {
    const competition = await this.getMain();
    return new Date(competition.locksAt.getTime() - LOCK_LEAD_MS);
  }

  /**
   * @deprecated Use `getLockAt()`. Mantido para compatibilidade — agora retorna
   * a mesma trava geral (1h antes do primeiro jogo da Copa).
   */
  async getKnockoutLockAt(): Promise<Date> {
    return this.getLockAt();
  }

  /**
   * Garante que os palpites ainda estão abertos contra a TRAVA GERAL. Usa o
   * relógio do banco (NOW()) em vez do relógio da aplicação para eliminar drift
   * entre réplicas da API. Lança 403 LOCKED_COMPETITION após a trava ou se a
   * competição não estiver mais com closureStatus = 'open'.
   */
  private async assertWithinLockWindow(code: 'LOCKED_COMPETITION' | 'LOCKED_KNOCKOUT'): Promise<void> {
    const rows = await this.prisma.$queryRaw<Array<{ now: Date }>>`SELECT NOW() as now`;
    const now = rows[0]?.now ?? new Date();
    const competition = await this.getMain();
    const lockAt = new Date(competition.locksAt.getTime() - LOCK_LEAD_MS);

    if (competition.closureStatus !== 'open' || lockAt <= now) {
      throw new ForbiddenException({
        code,
        message: 'Palpites travados — o envio fecha 1h antes do primeiro jogo da Copa.',
        locksAt: lockAt.toISOString(),
      });
    }
  }

  /** Trava de palpites da fase de grupos (trava geral). */
  async assertOpen(): Promise<void> {
    await this.assertWithinLockWindow('LOCKED_COMPETITION');
  }

  /** Trava de palpites do mata-mata — a MESMA trava geral da fase de grupos. */
  async assertKnockoutOpen(): Promise<void> {
    await this.assertWithinLockWindow('LOCKED_KNOCKOUT');
  }
}
