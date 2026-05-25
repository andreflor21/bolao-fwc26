import { Global, Module } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { EmailService } from './email.service';
import { MockEmailDriver } from './drivers/mock-email.driver';
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
