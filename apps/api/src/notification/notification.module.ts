import { Module } from '@nestjs/common';
import { PushController } from './push.controller';
import { PushService } from './push.service';
import { ReminderCron } from './reminder.cron';
import { PalpitesLockedCron } from './locked.cron';

@Module({
  controllers: [PushController],
  providers: [PushService, ReminderCron, PalpitesLockedCron],
  exports: [PushService],
})
export class NotificationModule {}
