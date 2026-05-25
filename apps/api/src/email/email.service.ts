import { Inject, Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { EMAIL_DRIVER } from './email.tokens';
import type { IEmailDriver } from './drivers/email-driver.interface';

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

  async sendWelcome(to: string, name: string): Promise<void> {
    const subject = 'Bem-vindo ao Bolão Copa 2026!';
    const text = `Olá ${name},\n\nSua conta foi criada com sucesso. Faça login em ${this.webOrigin}/login.\n\nNão esqueça: a inscrição no Bolão Geral custa R$ 50 (Pix) e libera palpites e bolões paralelos.`;
    await this.driver.send({ to, subject, html: `<p>${text.replace(/\n/g, '<br>')}</p>`, text });
  }

  async sendPasswordReset(to: string, name: string, token: string): Promise<void> {
    const link = `${this.webOrigin}/reset-password?token=${encodeURIComponent(token)}`;
    const subject = 'Redefinição de senha — Bolão Copa 2026';
    const text = `Olá ${name},\n\nRecebemos uma solicitação para redefinir sua senha. Clique no link abaixo (válido por 1 hora):\n\n${link}\n\nSe não foi você, ignore este e-mail.`;
    await this.driver.send({ to, subject, html: `<p>${text.replace(/\n/g, '<br>')}</p>`, text });
  }

  async sendPaymentConfirmed(to: string, name: string): Promise<void> {
    const subject = 'Pagamento confirmado — Bolão Copa 2026';
    const text = `Olá ${name},\n\nRecebemos sua inscrição no Bolão Geral! Você já pode submeter palpites e criar bolões paralelos: ${this.webOrigin}/dashboard`;
    await this.driver.send({ to, subject, html: `<p>${text.replace(/\n/g, '<br>')}</p>`, text });
  }
}
