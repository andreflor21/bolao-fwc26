import { Logger } from '@nestjs/common';
import type { EmailMessage, IEmailDriver } from './email-driver.interface';

export class MockEmailDriver implements IEmailDriver {
  private readonly logger = new Logger('MockEmail');
  readonly sent: EmailMessage[] = [];

  async send(message: EmailMessage): Promise<void> {
    this.sent.push(message);
    this.logger.log(`📧 [MOCK] To: ${message.to} | Subject: ${message.subject}`);
    this.logger.debug(message.text);
  }
}
