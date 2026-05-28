import { Global, Module } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { EmailService } from './email.service';
import { MockEmailDriver } from './drivers/mock-email.driver';
import { SmtpEmailDriver } from './drivers/smtp-email.driver';
import { EMAIL_DRIVER } from './email.tokens';
import type { IEmailDriver } from './drivers/email-driver.interface';

@Global()
@Module({
  providers: [
    {
      provide: EMAIL_DRIVER,
      useFactory: (config: ConfigService): IEmailDriver => {
        const driver = config.get<string>('EMAIL_DRIVER') ?? 'mock';
        switch (driver) {
          case 'mock':
            return new MockEmailDriver();
          case 'smtp': {
            const port = Number(config.get<number>('SMTP_PORT') ?? 587);
            return new SmtpEmailDriver({
              host: config.get<string>('SMTP_HOST') ?? 'localhost',
              port,
              user: config.get<string>('SMTP_USER'),
              pass: config.get<string>('SMTP_PASSWORD'),
              secure: port === 465,
              from: config.get<string>('EMAIL_FROM') ?? 'Bolão Copa 2026 <noreply@bolao.local>',
            });
          }
          // case 'resend':
          //   return new ResendEmailDriver(config.get('RESEND_API_KEY'));
          default:
            throw new Error(`Unknown EMAIL_DRIVER: ${driver}`);
        }
      },
      inject: [ConfigService],
    },
    EmailService,
  ],
  exports: [EmailService],
})
export class EmailModule {}
