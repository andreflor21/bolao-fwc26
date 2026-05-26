import { Module } from '@nestjs/common';
import { PushController } from './push.controller';
import { PushService } from './push.service';
import { ReminderCron } from './reminder.cron';

@Module({
  controllers: [PushController],
  providers: [PushService, ReminderCron],
  exports: [PushService],
})
export class NotificationModule {}
