import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { ThrottlerModule, ThrottlerGuard } from '@nestjs/throttler';
import { APP_GUARD } from '@nestjs/core';
import { PrismaModule } from './prisma/prisma.module';
import { AuthModule } from './auth/auth.module';
import { SubscriptionModule } from './subscription/subscription.module';
import { SidePoolModule } from './side-pool/side-pool.module';
import { EmailModule } from './email/email.module';
import { CompetitionModule } from './competition/competition.module';
import { GuessModule } from './guess/guess.module';
import { MatchModule } from './match/match.module';
import { AdminModule } from './admin/admin.module';
import { PaymentModule } from './payment/payment.module';
import { RedisModule } from './redis/redis.module';
import { RankingModule } from './ranking/ranking.module';
import { PrizeModule } from './prize/prize.module';
import { HealthController } from './health/health.controller';
import { validateEnv } from './config/env.validation';

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
      cache: true,
      validate: validateEnv,
    }),
    ThrottlerModule.forRoot([
      {
        name: 'default',
        ttl: Number(process.env.THROTTLE_TTL ?? 60) * 1000,
        limit: Number(process.env.THROTTLE_LIMIT ?? 100),
      },
    ]),
    PrismaModule,
    RedisModule,
    EmailModule,
    CompetitionModule,
    AuthModule,
    SubscriptionModule,
    PaymentModule,
    SidePoolModule,
    MatchModule,
    GuessModule,
    RankingModule,
    PrizeModule,
    AdminModule,
  ],
  controllers: [HealthController],
  providers: [
    {
      provide: APP_GUARD,
      useClass: ThrottlerGuard,
    },
  ],
})
export class AppModule {}
