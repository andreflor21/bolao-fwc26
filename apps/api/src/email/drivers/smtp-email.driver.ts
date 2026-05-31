import { Logger } from '@nestjs/common';
import nodemailer, { type Transporter } from 'nodemailer';
import type { EmailMessage, IEmailDriver } from './email-driver.interface';

export interface SmtpConfig {
  host: string;
  port: number;
  user?: string;
  pass?: string;
  /** true para porta 465 (TLS implícito); false usa STARTTLS quando disponível. */
  secure: boolean;
  from: string;
}

export class SmtpEmailDriver implements IEmailDriver {
  private readonly logger = new Logger('SmtpEmail');
  private readonly transporter: Transporter;
  private readonly from: string;

  constructor(config: SmtpConfig) {
    this.from = config.from;
    this.transporter = nodemailer.createTransport({
      host: config.host,
      port: config.port,
      secure: config.secure,
      ...(config.user ? { auth: { user: config.user, pass: config.pass } } : {}),
    });
  }

  async send(message: EmailMessage): Promise<void> {
    await this.transporter.sendMail({
      from: this.from,
      to: message.to,
      subject: message.subject,
      html: message.html,
      text: message.text,
    });
    this.logger.log(`📧 To: ${message.to} | Subject: ${message.subject}`);
  }
}
