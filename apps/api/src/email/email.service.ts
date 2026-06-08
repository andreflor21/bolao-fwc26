import { Inject, Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { EMAIL_DRIVER } from './email.tokens';
import type { IEmailDriver } from './drivers/email-driver.interface';

function brl(cents: number): string {
  return (cents / 100).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
}

@Injectable()
export class EmailService {
  private readonly from: string;
  private readonly webOrigin: string;

  constructor(
    @Inject(EMAIL_DRIVER) private readonly driver: IEmailDriver,
    config: ConfigService,
  ) {
    this.from = config.get<string>('EMAIL_FROM') ?? 'Bolão Copa 2026 <noreply@bolao.local>';
    this.webOrigin = config.get<string>('WEB_ORIGIN') ?? 'http://localhost:5173';
  }

  /**
   * Layout HTML compartilhado — estilos inline (compatibilidade com clientes
   * de email) na paleta do app (midnight + emerald + gold). `text` é o
   * fallback plain-text; `cta` é um botão opcional.
   */
  private async render(
    to: string,
    subject: string,
    opts: { heading: string; bodyHtml: string; text: string; cta?: { label: string; url: string } },
  ): Promise<void> {
    const ctaHtml = opts.cta
      ? `<tr><td style="padding:20px 28px 4px;">
           <a href="${opts.cta.url}" style="display:inline-block;background:#f59e0b;color:#0b1220;text-decoration:none;font-weight:700;padding:12px 22px;border-radius:10px;font-family:Arial,sans-serif;">${opts.cta.label}</a>
         </td></tr>`
      : '';
    const html = `<!doctype html><html lang="pt-BR"><body style="margin:0;background:#0b1220;padding:24px;">
      <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:560px;margin:0 auto;background:#111a2e;border:1px solid rgba(16,185,129,0.15);border-radius:16px;">
        <tr><td style="padding:28px 28px 8px;">
          <p style="margin:0;font-family:Arial,sans-serif;font-size:11px;letter-spacing:3px;color:#6ee7b7;">BOLÃO DA TURMA · COPA 2026</p>
          <h1 style="margin:8px 0 0;font-family:Georgia,serif;font-size:22px;color:#ffffff;">${opts.heading}</h1>
        </td></tr>
        <tr><td style="padding:8px 28px 0;font-family:Arial,sans-serif;font-size:15px;line-height:1.6;color:#d1fae5;">
          ${opts.bodyHtml}
        </td></tr>
        ${ctaHtml}
        <tr><td style="padding:24px 28px 28px;font-family:Arial,sans-serif;font-size:12px;color:rgba(209,250,229,0.5);border-top:1px solid rgba(16,185,129,0.12);">
          Bolão recreativo entre amigos — Copa do Mundo FIFA 2026.
        </td></tr>
      </table></body></html>`;
    await this.driver.send({ to, subject, html, text: opts.text });
  }

  async sendWelcome(to: string, name: string): Promise<void> {
    await this.render(to, 'Bem-vindo ao Bolão Copa 2026!', {
      heading: `Bem-vindo, ${name}!`,
      bodyHtml: `<p>Sua conta foi criada com sucesso. A inscrição no Bolão Geral (R$ 50 via Pix) libera palpites e bolões paralelos.</p>`,
      text: `Olá ${name},\n\nSua conta foi criada com sucesso. Faça login em ${this.webOrigin}/login.`,
      cta: { label: 'Fazer login', url: `${this.webOrigin}/login` },
    });
  }

  async sendPasswordReset(to: string, name: string, token: string): Promise<void> {
    const link = `${this.webOrigin}/reset-password?token=${encodeURIComponent(token)}`;
    await this.render(to, 'Redefinição de senha — Bolão Copa 2026', {
      heading: 'Redefinir senha',
      bodyHtml: `<p>Olá ${name}, recebemos uma solicitação para redefinir sua senha. O link é válido por 1 hora. Se não foi você, ignore este e-mail.</p>`,
      text: `Olá ${name},\n\nRedefina sua senha (válido por 1h): ${link}\n\nSe não foi você, ignore este e-mail.`,
      cta: { label: 'Redefinir senha', url: link },
    });
  }

  async sendPaymentConfirmed(to: string, name: string): Promise<void> {
    await this.render(to, 'Pagamento confirmado — Bolão Copa 2026', {
      heading: 'Inscrição confirmada! 🎉',
      bodyHtml: `<p>Olá ${name}, recebemos sua inscrição no Bolão Geral! Você já pode submeter palpites e criar bolões paralelos.</p>`,
      text: `Olá ${name},\n\nRecebemos sua inscrição! Acesse ${this.webOrigin}/dashboard`,
      cta: { label: 'Ir para o painel', url: `${this.webOrigin}/dashboard` },
    });
  }

  /** Disparado no fechamento da janela de palpites (lock). */
  async sendPalpitesLocked(to: string, name: string): Promise<void> {
    await this.render(to, 'Palpites travados — boa sorte! 🔒', {
      heading: 'Palpites travados',
      bodyHtml: `<p>Olá ${name}, a janela de palpites foi encerrada e seus palpites estão travados. Agora é torcer! Acompanhe o ranking ao vivo conforme os jogos rolam.</p>`,
      text: `Olá ${name},\n\nA janela de palpites fechou. Acompanhe o ranking em ${this.webOrigin}/ranking`,
      cta: { label: 'Ver ranking', url: `${this.webOrigin}/ranking` },
    });
  }

  /** Disparado quando o jogador entra ou sai do top 10. */
  async sendRankingPositionChanged(
    to: string,
    name: string,
    position: number,
    entered: boolean,
  ): Promise<void> {
    const heading = entered ? 'Você entrou no top 10! 🚀' : 'Você saiu do top 10';
    const msg = entered
      ? `Você subiu para a <strong>${position}ª posição</strong> no ranking geral. Continue de olho!`
      : `Você caiu para a <strong>${position}ª posição</strong> e saiu do top 10. Ainda dá tempo de recuperar nos próximos jogos.`;
    await this.render(to, `${heading} — Bolão Copa 2026`, {
      heading,
      bodyHtml: `<p>Olá ${name}, ${msg}</p>`,
      text: `Olá ${name}, sua posição no ranking mudou: ${position}º. Veja em ${this.webOrigin}/ranking`,
      cta: { label: 'Ver ranking', url: `${this.webOrigin}/ranking` },
    });
  }

  /**
   * Disparado quando o bracket do mata-mata de um jogador é resetado por
   * correção do chaveamento oficial — pede que ele refaça os palpites do KO.
   */
  async sendBracketResetNotice(to: string, name: string): Promise<void> {
    const link = `${this.webOrigin}/knockout-guesses`;
    await this.render(to, 'Importante: refaça seus palpites do mata-mata ⚠️', {
      heading: 'Refaça seu mata-mata',
      bodyHtml: `<p>Olá ${name}, corrigimos o chaveamento das fases finais (oitavas em diante) para refletir a chave <strong>oficial da FIFA</strong>. Por isso, seus palpites do mata-mata foram zerados e precisam ser refeitos.</p>
        <p>Seus palpites da <strong>fase de grupos continuam salvos</strong> — é só refazer o bracket do mata-mata. Leva poucos minutos.</p>`,
      text: `Olá ${name},\n\nCorrigimos o chaveamento das fases finais para a chave oficial da FIFA. Seus palpites do mata-mata foram zerados e precisam ser refeitos (os de grupos continuam salvos).\n\nRefaça em: ${link}`,
      cta: { label: 'Refazer mata-mata', url: link },
    });
  }

  /** Disparado no closure, para cada premiado com userId. */
  async sendPrizeAwarded(
    to: string,
    name: string,
    categoryLabel: string,
    amountCents: number,
  ): Promise<void> {
    await this.render(to, 'Você foi premiado! 🏆 — Bolão Copa 2026', {
      heading: 'Você foi premiado! 🏆',
      bodyHtml: `<p>Parabéns, ${name}! Você ganhou <strong>${categoryLabel}</strong> no Bolão Copa 2026, no valor de <strong>${brl(amountCents)}</strong>. Em breve o organizador fará o pagamento via Pix.</p>`,
      text: `Parabéns, ${name}! Você ganhou ${categoryLabel} (${brl(amountCents)}). Detalhes em ${this.webOrigin}/prizes`,
      cta: { label: 'Ver prêmios', url: `${this.webOrigin}/prizes` },
    });
  }

  /** Disparado quando o admin marca o prêmio como pago. */
  async sendPrizePaid(
    to: string,
    name: string,
    categoryLabel: string,
    amountCents: number,
    pixKey: string | null,
    paymentReference: string | null,
  ): Promise<void> {
    const pixLine = pixKey ? ` para a sua chave Pix <strong>${pixKey}</strong>` : '';
    const refLine = paymentReference
      ? `<p style="font-size:13px;color:rgba(209,250,229,0.7);">Comprovante/identificador: ${paymentReference}</p>`
      : '';
    await this.render(to, 'Prêmio pago — confirme o recebimento ✅', {
      heading: 'Prêmio pago ✅',
      bodyHtml: `<p>Olá ${name}, o prêmio de <strong>${categoryLabel}</strong> (<strong>${brl(amountCents)}</strong>) foi pago${pixLine}. Por favor, confirme o recebimento com o organizador.</p>${refLine}`,
      text: `Olá ${name}, seu prêmio ${categoryLabel} (${brl(amountCents)}) foi pago${pixKey ? ` para a chave Pix ${pixKey}` : ''}.${paymentReference ? ` Ref: ${paymentReference}.` : ''} Confirme o recebimento.`,
    });
  }
}
