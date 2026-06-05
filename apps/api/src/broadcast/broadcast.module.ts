import { Module } from '@nestjs/common';
import { BroadcastController } from './broadcast.controller';
import { BroadcastService } from './broadcast.service';
import { BroadcastAIService } from './broadcast-ai.service';
import { WhatsappService } from './whatsapp.service';
import { GroupInviteService } from './group-invite.service';
import { AdminModule } from '../admin/admin.module';

@Module({
  imports: [AdminModule],
  controllers: [BroadcastController],
  providers: [BroadcastService, BroadcastAIService, WhatsappService, GroupInviteService],
})
export class BroadcastModule {}
