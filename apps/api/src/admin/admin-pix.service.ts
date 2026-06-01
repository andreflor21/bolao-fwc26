import { Injectable, Logger, NotFoundException } from '@nestjs/common';
import { PixReceiptStatus } from '@prisma/client';
import { FIFA_WC_2026_ID } from '@bolao/shared';
import { PrismaService } from '../prisma/prisma.service';
import { EmailService } from '../email/email.service';
import { RankingService } from '../ranking/ranking.service';

export interface PendingPixItem {
  subscriptionId: string;
  userId: string;
  userName: string;
  userEmail: string;
  amountCents: number;
  receiptStatus: PixReceiptStatus;
  uploadedAt: string | null;
  notes: string | null;
  verdict: unknown;
  hasReceiptImage: boolean;
}

/**
 * Aprovação manual de inscrições pagas via Pix. Lista quem enviou comprovante
 * mas não foi confirmado automaticamente, deixa o admin ver o comprovante e
 * ativar (ou recusar) a inscrição.
 */
@Injectable()
export class AdminPixService {
  private readonly logger = new Logger(AdminPixService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly email: EmailService,
    private readonly ranking: RankingService,
  ) {}

  async listPending(): Promise<PendingPixItem[]> {
    const subs = await this.prisma.subscription.findMany({
      where: {
        competitionId: FIFA_WC_2026_ID,
        status: 'pending_payment',
        pixReceiptStatus: {
          in: [
            PixReceiptStatus.manual_review,
            PixReceiptStatus.rejected,
            PixReceiptStatus.analyzing,
          ],
        },
      },
      orderBy: { pixReceiptUploadedAt: 'desc' },
      // `select` evita carregar o base64 do comprovante (pode ter MBs) na
      // listagem — o `pix_receipt_mime` serve de proxy pra "tem imagem?".
      select: {
        id: true,
        userId: true,
        amountCents: true,
        pixReceiptStatus: true,
        pixReceiptUploadedAt: true,
        pixReceiptNotes: true,
        pixReceiptVerdict: true,
        pixReceiptMime: true,
        user: { select: { name: true, email: true } },
      },
    });

    return subs.map((s) => ({
      subscriptionId: s.id,
      userId: s.userId,
      userName: s.user.name,
      userEmail: s.user.email,
      amountCents: s.amountCents,
      receiptStatus: s.pixReceiptStatus,
      uploadedAt: s.pixReceiptUploadedAt?.toISOString() ?? null,
      notes: s.pixReceiptNotes,
      verdict: s.pixReceiptVerdict ?? null,
      hasReceiptImage: Boolean(s.pixReceiptMime),
    }));
  }

  async getReceipt(subscriptionId: string): Promise<{ dataUrl: string }> {
    const sub = await this.prisma.subscription.findUnique({
      where: { id: subscriptionId },
      select: { pixReceiptImage: true, pixReceiptMime: true },
    });
    if (!sub || !sub.pixReceiptImage) {
      throw new NotFoundException('Comprovante não encontrado');
    }
    const mime = sub.pixReceiptMime ?? 'image/png';
    return { dataUrl: `data:${mime};base64,${sub.pixReceiptImage}` };
  }

  async approve(subscriptionId: string): Promise<{ activated: boolean; reason?: string }> {
    const sub = await this.prisma.subscription.findUnique({
      where: { id: subscriptionId },
      include: { user: { select: { id: true, email: true, name: true } } },
    });
    if (!sub) throw new NotFoundException('Inscrição não encontrada');
    if (sub.status === 'active') return { activated: false, reason: 'already_active' };
    if (sub.status === 'refunded') return { activated: false, reason: 'refunded' };

    await this.prisma.$transaction([
      this.prisma.subscription.update({
        where: { id: sub.id },
        data: {
          status: 'active',
          paidAt: new Date(),
          pixReceiptStatus: PixReceiptStatus.auto_confirmed,
          pixReceiptNotes: 'Aprovado manualmente pelo admin.',
        },
      }),
      this.prisma.user.update({ where: { id: sub.userId }, data: { role: 'subscriber' } }),
    ]);

    await this.ranking.recomputeForUser(sub.userId);
    await this.email
      .sendPaymentConfirmed(sub.user.email, sub.user.name)
      .catch((e) => this.logger.warn(`Confirmation email failed: ${(e as Error).message}`));

    this.logger.log(`Admin approved Pix subscription ${sub.id} for user ${sub.userId}`);
    return { activated: true };
  }

  async reject(subscriptionId: string, reason?: string): Promise<{ rejected: boolean }> {
    const sub = await this.prisma.subscription.findUnique({ where: { id: subscriptionId } });
    if (!sub) throw new NotFoundException('Inscrição não encontrada');
    await this.prisma.subscription.update({
      where: { id: sub.id },
      data: {
        pixReceiptStatus: PixReceiptStatus.rejected,
        pixReceiptNotes: (reason ?? 'Recusado manualmente pelo admin.').slice(0, 500),
      },
    });
    this.logger.log(`Admin rejected Pix subscription ${sub.id}`);
    return { rejected: true };
  }
}
