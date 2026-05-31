import {
  BadRequestException,
  ConflictException,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import Anthropic from '@anthropic-ai/sdk';
import * as QRCode from 'qrcode';
import { PrismaService } from '../prisma/prisma.service';
import { EmailService } from '../email/email.service';
import { CompetitionService } from '../competition/competition.service';
import { FIFA_WC_2026_ID } from '@bolao/shared';
import { PixReceiptStatus, Prisma, type SubscriptionStatus } from '@prisma/client';

export interface PixFallbackDetails {
  enabled: boolean;
  amountCents: number;
  payload: string;
  qrCodeDataUrl: string;
  pixKey: string;
  recipientName: string;
  recipientTaxId: string;
  receiptStatus: PixReceiptStatus;
  subscriptionStatus: SubscriptionStatus;
}

export interface ReceiptVerdict {
  status: 'auto_confirmed' | 'manual_review' | 'rejected';
  reason: string;
  extracted: {
    amountCents: number | null;
    pixKey: string | null;
    recipientName: string | null;
    recipientTaxId: string | null;
    paidAtIso: string | null;
  };
}

export interface ReceiptSubmissionResult {
  status: PixReceiptStatus;
  subscriptionStatus: SubscriptionStatus;
  verdict: ReceiptVerdict;
}

const ALLOWED_IMAGE_MIMES = ['image/png', 'image/jpeg', 'image/webp'] as const;
const ALLOWED_DOCUMENT_MIMES = ['application/pdf'] as const;
const ALLOWED_MIMES = [...ALLOWED_IMAGE_MIMES, ...ALLOWED_DOCUMENT_MIMES] as const;
type AllowedImageMime = (typeof ALLOWED_IMAGE_MIMES)[number];
type AllowedDocumentMime = (typeof ALLOWED_DOCUMENT_MIMES)[number];
type AllowedMime = AllowedImageMime | AllowedDocumentMime;
const MAX_SIZE_BYTES = 5 * 1024 * 1024;

/**
 * Pix manual fallback: enquanto a conta Stripe BR não libera Pix (KYC 60d),
 * o jogador paga via BR Code estático e anexa o comprovante. Claude (visão)
 * extrai valor + chave Pix + recipient do PNG/JPG e decide:
 *   auto_confirmed → ativa a subscription imediatamente
 *   manual_review  → admin revisa via Prisma Studio (raro)
 *   rejected       → erro pro usuário com motivo
 */
@Injectable()
export class PixFallbackService {
  private readonly logger = new Logger(PixFallbackService.name);
  private readonly enabled: boolean;
  private readonly payload: string;
  private readonly pixKey: string;
  private readonly recipientName: string;
  /**
   * CPF/CNPJ do recebedor (só dígitos). Comprovantes BR variam muito — Itaú
   * mostra CNPJ mas omite a chave UUID; outros bancos fazem o contrário.
   * Aceitar qualquer um {nome, chave, CNPJ} como prova de identidade.
   */
  private readonly recipientTaxId: string;
  private readonly amountCents: number;
  private readonly model: string;
  private readonly anthropic: Anthropic | null;

  constructor(
    private readonly prisma: PrismaService,
    private readonly email: EmailService,
    private readonly competition: CompetitionService,
    config: ConfigService,
  ) {
    this.enabled =
      (config.get<string>('PIX_FALLBACK_ENABLED') ?? 'false').toLowerCase() === 'true';
    this.payload = config.get<string>('PIX_FALLBACK_PAYLOAD') ?? '';
    this.pixKey = config.get<string>('PIX_FALLBACK_PIX_KEY') ?? '';
    this.recipientName = config.get<string>('PIX_FALLBACK_RECIPIENT_NAME') ?? '';
    this.recipientTaxId = (config.get<string>('PIX_FALLBACK_RECIPIENT_CNPJ') ?? '').replace(
      /\D/g,
      '',
    );
    this.amountCents = Number(config.get('SUBSCRIPTION_AMOUNT_CENTS') ?? 5000);
    this.model = config.get<string>('ANTHROPIC_MODEL') ?? 'claude-haiku-4-5-20251001';
    const apiKey = config.get<string>('ANTHROPIC_API_KEY');
    this.anthropic = apiKey ? new Anthropic({ apiKey }) : null;

    if (this.enabled) {
      const missing: string[] = [];
      if (!this.payload) missing.push('PIX_FALLBACK_PAYLOAD');
      if (!this.pixKey) missing.push('PIX_FALLBACK_PIX_KEY');
      if (!this.recipientName) missing.push('PIX_FALLBACK_RECIPIENT_NAME');
      if (!this.recipientTaxId) missing.push('PIX_FALLBACK_RECIPIENT_CNPJ');
      if (!this.anthropic) missing.push('ANTHROPIC_API_KEY');
      if (missing.length > 0) {
        this.logger.warn(
          `PIX_FALLBACK_ENABLED=true but missing: ${missing.join(', ')} — feature will reject requests`,
        );
      } else {
        this.logger.log(
          `Pix fallback enabled (key=${this.pixKey}, cnpj=${this.recipientTaxId || '—'}, recipient=${this.recipientName}, model=${this.model})`,
        );
      }
    }
  }

  isEnabled(): boolean {
    return (
      this.enabled &&
      Boolean(this.payload && this.pixKey && this.recipientName && this.recipientTaxId && this.anthropic)
    );
  }

  async getDetails(userId: string): Promise<PixFallbackDetails> {
    if (!this.isEnabled()) {
      throw new NotFoundException('Pix fallback is not enabled');
    }

    await this.competition.assertOpen();

    const subscription = await this.prisma.subscription.upsert({
      where: { userId_competitionId: { userId, competitionId: FIFA_WC_2026_ID } },
      create: {
        userId,
        competitionId: FIFA_WC_2026_ID,
        status: 'pending_payment',
        amountCents: this.amountCents,
      },
      update: {},
    });

    if (subscription.status === 'refunded') {
      throw new ConflictException({
        code: 'SUBSCRIPTION_REFUNDED',
        message: 'This subscription was refunded — contact support to re-subscribe',
      });
    }

    const qrCodeDataUrl = await QRCode.toDataURL(this.payload, {
      errorCorrectionLevel: 'M',
      margin: 1,
      width: 320,
    });

    return {
      enabled: true,
      amountCents: subscription.amountCents,
      payload: this.payload,
      qrCodeDataUrl,
      pixKey: this.pixKey,
      recipientName: this.recipientName,
      recipientTaxId: this.recipientTaxId,
      receiptStatus: subscription.pixReceiptStatus,
      subscriptionStatus: subscription.status,
    };
  }

  async submitReceipt(
    userId: string,
    file: { buffer: Buffer; mimetype: string; size: number },
  ): Promise<ReceiptSubmissionResult> {
    if (!this.isEnabled()) {
      throw new NotFoundException('Pix fallback is not enabled');
    }
    if (!ALLOWED_MIMES.includes(file.mimetype as AllowedMime)) {
      throw new BadRequestException(
        `Tipo de arquivo não suportado (${file.mimetype}) — use PNG, JPEG, WebP ou PDF`,
      );
    }
    if (file.size > MAX_SIZE_BYTES) {
      throw new BadRequestException('Arquivo maior que 5MB');
    }
    if (file.size === 0) {
      throw new BadRequestException('Arquivo vazio');
    }

    await this.competition.assertOpen();

    const subscription = await this.prisma.subscription.findUnique({
      where: { userId_competitionId: { userId, competitionId: FIFA_WC_2026_ID } },
    });
    if (!subscription) {
      throw new NotFoundException('No subscription — open /pay first');
    }
    if (subscription.status === 'active') {
      throw new ConflictException({
        code: 'ALREADY_ACTIVE',
        message: 'Subscription is already active',
      });
    }
    if (subscription.status === 'refunded') {
      throw new ConflictException({
        code: 'SUBSCRIPTION_REFUNDED',
        message: 'This subscription was refunded — contact support to re-subscribe',
      });
    }

    await this.prisma.subscription.update({
      where: { id: subscription.id },
      data: {
        pixReceiptStatus: PixReceiptStatus.analyzing,
        pixReceiptUploadedAt: new Date(),
      },
    });

    let verdict: ReceiptVerdict;
    try {
      verdict = await this.callClaude(
        file.buffer,
        file.mimetype as AllowedMime,
        subscription.amountCents,
      );
    } catch (e) {
      this.logger.error(`Claude verification failed: ${(e as Error).message}`);
      await this.prisma.subscription.update({
        where: { id: subscription.id },
        data: {
          pixReceiptStatus: PixReceiptStatus.manual_review,
          pixReceiptNotes: `AI error: ${(e as Error).message}`.slice(0, 500),
        },
      });
      return {
        status: PixReceiptStatus.manual_review,
        subscriptionStatus: subscription.status,
        verdict: {
          status: 'manual_review',
          reason:
            'Não consegui analisar o comprovante automaticamente. Encaminhei para revisão manual.',
          extracted: {
            amountCents: null,
            pixKey: null,
            recipientName: null,
            recipientTaxId: null,
            paidAtIso: null,
          },
        },
      };
    }

    const verdictJson = JSON.parse(JSON.stringify(verdict)) as Prisma.InputJsonValue;

    if (verdict.status === 'auto_confirmed') {
      const user = await this.prisma.user.findUnique({
        where: { id: userId },
        select: { email: true, name: true },
      });
      await this.prisma.$transaction([
        this.prisma.subscription.update({
          where: { id: subscription.id },
          data: {
            status: 'active',
            paidAt: new Date(),
            pixReceiptStatus: PixReceiptStatus.auto_confirmed,
            pixReceiptVerdict: verdictJson,
            pixReceiptNotes: verdict.reason.slice(0, 500),
          },
        }),
        this.prisma.user.update({ where: { id: userId }, data: { role: 'subscriber' } }),
      ]);
      if (user) {
        await this.email
          .sendPaymentConfirmed(user.email, user.name)
          .catch((e) => this.logger.warn(`Confirmation email failed: ${(e as Error).message}`));
      }
      this.logger.log(`Auto-confirmed Pix subscription ${subscription.id} for user ${userId}`);
      return {
        status: PixReceiptStatus.auto_confirmed,
        subscriptionStatus: 'active',
        verdict,
      };
    }

    const nextStatus =
      verdict.status === 'rejected'
        ? PixReceiptStatus.rejected
        : PixReceiptStatus.manual_review;
    await this.prisma.subscription.update({
      where: { id: subscription.id },
      data: {
        pixReceiptStatus: nextStatus,
        pixReceiptVerdict: verdictJson,
        pixReceiptNotes: verdict.reason.slice(0, 500),
      },
    });
    this.logger.warn(
      `Pix receipt for user ${userId} → ${verdict.status}: ${verdict.reason}`,
    );
    return { status: nextStatus, subscriptionStatus: subscription.status, verdict };
  }

  private async callClaude(
    buffer: Buffer,
    mimeType: AllowedMime,
    expectedAmountCents: number,
  ): Promise<ReceiptVerdict> {
    if (!this.anthropic) throw new Error('Anthropic client not initialised');
    const base64 = buffer.toString('base64');
    const isPdf = (ALLOWED_DOCUMENT_MIMES as readonly string[]).includes(mimeType);
    const expectedReais = (expectedAmountCents / 100).toFixed(2);
    const expectedTaxIdLine = this.recipientTaxId
      ? `- CPF/CNPJ esperado do recebedor: "${this.recipientTaxId}" (compare apenas dígitos)`
      : '';
    const prompt = `Você é um verificador de comprovantes Pix para o Bolão Copa do Mundo FIFA 2026. Analise o comprovante em anexo (${isPdf ? 'PDF' : 'imagem'}).

Extraia destes campos do comprovante:
- valor pago em centavos (R$ 50,00 → 5000)
- chave Pix do destinatário se exibida (UUID, e-mail, telefone, ou EVP). Se o comprovante mostrar apenas CPF/CNPJ do recebedor (caso comum no Itaú), deixe pixKey como null e preencha recipientTaxId.
- CPF/CNPJ do destinatário (só dígitos, sem pontos/traços/barras) — comum em "Para → CPF/CNPJ"
- nome ou razão social do destinatário
- data/hora do pagamento (ISO-8601 com fuso, ou null se não houver)

Dados esperados:
- Valor: R$ ${expectedReais} (${expectedAmountCents} centavos) — DEVE bater exatamente
- Chave Pix do recebedor: "${this.pixKey}" (pode não aparecer no comprovante — tudo bem)
${expectedTaxIdLine}
- Nome do recebedor: "${this.recipientName}" (case-insensitive, abreviações OK)

Responda APENAS um JSON estrito (sem markdown, sem comentários, sem texto antes/depois) neste formato:
{
  "status": "auto_confirmed" | "manual_review" | "rejected",
  "reason": "string curta em pt-BR explicando o veredito, focando no que de fato falhou (ex.: 'valor R$ 0,01 difere do esperado R$ 50,00')",
  "extracted": {
    "amountCents": number | null,
    "pixKey": string | null,
    "recipientName": string | null,
    "recipientTaxId": string | null,
    "paidAtIso": string | null
  }
}

Regra de decisão (aplique em ordem):
1. Se o arquivo NÃO é um comprovante Pix → "rejected".
2. Se o valor difere do esperado → "rejected" (mesmo que o recebedor esteja certo). O reason deve dizer só isso.
3. Identidade do recebedor: considere CORRETA se QUALQUER UM destes bater (basta UM, NÃO exija todos):
   - CPF/CNPJ do recebedor = CPF/CNPJ esperado (comparando só os dígitos) — este é o identificador DEFINITIVO
   - chave Pix do recebedor = chave esperada
   - nome do recebedor ≈ nome esperado (case-insensitive, abreviações OK)
   ATENÇÃO: bancos quase sempre TRUNCAM o nome do recebedor no comprovante (ex.: "ANDRE FELIPE OLIVEIRA FLOR DES" é o começo de "ANDRE FELIPE OLIVEIRA FLOR DESENVOLVIMENTO DE SOFTWARE LTDA"). Se o CPF/CNPJ OU a chave Pix baterem, a identidade está CORRETA mesmo com o nome cortado/abreviado/parcial — NÃO recuse por causa disso.
   Só marque "rejected" por identidade se o CPF/CNPJ for claramente de OUTRA pessoa E a chave também não bater.
4. Tudo confere → "auto_confirmed".
5. Arquivo ilegível, dados faltando ou ambiguidade → "manual_review" (nunca auto_confirme em dúvida).

Não exija TODOS os identificadores ao mesmo tempo — comprovantes brasileiros variam por banco (Itaú costuma mostrar CNPJ e omitir a chave UUID).`;

    // PDFs go through the `document` content block (native PDF understanding
    // on Claude 3.5+); PNG/JPEG/WebP use `image`. Both share the same base64
    // source shape — the discriminator is the `type` and `media_type`.
    const attachment = isPdf
      ? ({
          type: 'document' as const,
          source: {
            type: 'base64' as const,
            media_type: 'application/pdf' as const,
            data: base64,
          },
        })
      : ({
          type: 'image' as const,
          source: {
            type: 'base64' as const,
            media_type: mimeType as AllowedImageMime,
            data: base64,
          },
        });

    const response = await this.anthropic.messages.create({
      model: this.model,
      max_tokens: 1024,
      messages: [
        {
          role: 'user',
          content: [attachment, { type: 'text', text: prompt }],
        },
      ],
    });

    const textBlock = response.content.find((b) => b.type === 'text');
    if (!textBlock || textBlock.type !== 'text') {
      throw new Error('Claude returned no text content');
    }
    // Strip markdown fences if the model wrapped JSON despite the instruction.
    const cleaned = textBlock.text
      .trim()
      .replace(/^```(?:json)?\s*/i, '')
      .replace(/\s*```$/, '')
      .trim();
    let parsed: unknown;
    try {
      parsed = JSON.parse(cleaned);
    } catch {
      throw new Error(`Claude returned non-JSON: ${cleaned.slice(0, 200)}`);
    }
    const verdict = this.normaliseVerdict(parsed);

    // Bancos truncam o nome do recebedor no comprovante, o que fazia o modelo
    // recusar pagamentos legítimos por "nome divergente". O CPF/CNPJ é o
    // identificador definitivo: se o valor bate exatamente E o CPF/CNPJ extraído
    // é igual ao esperado (ambos só dígitos), confirmamos independente do nome.
    if (
      verdict.status !== 'auto_confirmed' &&
      this.recipientTaxId.length > 0 &&
      verdict.extracted.amountCents === expectedAmountCents &&
      (verdict.extracted.recipientTaxId ?? '') === this.recipientTaxId
    ) {
      verdict.status = 'auto_confirmed';
      verdict.reason =
        'Valor e CPF/CNPJ do recebedor conferem (nome truncado pelo banco é esperado).';
    }
    return verdict;
  }

  private normaliseVerdict(raw: unknown): ReceiptVerdict {
    if (!raw || typeof raw !== 'object') throw new Error('Verdict not an object');
    const r = raw as Partial<ReceiptVerdict> & { extracted?: unknown };
    const status =
      r.status === 'auto_confirmed' || r.status === 'manual_review' || r.status === 'rejected'
        ? r.status
        : 'manual_review';
    const reason = typeof r.reason === 'string' ? r.reason.slice(0, 500) : 'sem motivo';
    const ex = (r.extracted ?? {}) as Record<string, unknown>;
    const taxIdRaw =
      typeof ex.recipientTaxId === 'string'
        ? ex.recipientTaxId.replace(/\D/g, '')
        : null;
    return {
      status,
      reason,
      extracted: {
        amountCents: typeof ex.amountCents === 'number' ? ex.amountCents : null,
        pixKey: typeof ex.pixKey === 'string' ? ex.pixKey : null,
        recipientName: typeof ex.recipientName === 'string' ? ex.recipientName : null,
        recipientTaxId: taxIdRaw && taxIdRaw.length > 0 ? taxIdRaw : null,
        paidAtIso: typeof ex.paidAtIso === 'string' ? ex.paidAtIso : null,
      },
    };
  }
}
