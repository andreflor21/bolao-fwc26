import { randomUUID } from 'node:crypto';
import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { ScheduleModule } from '@nestjs/schedule';
import { ThrottlerModule, ThrottlerGuard } from '@nestjs/throttler';
import { APP_GUARD, APP_FILTER } from '@nestjs/core';
import { LoggerModule } from 'nestjs-pino';
import { SentryExceptionFilter } from './common/sentry-exception.filter';
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
import { NotificationModule } from './notification/notification.module';
import { BroadcastModule } from './broadcast/broadcast.module';
import { ProfileModule } from './profile/profile.module';
import { HealthController } from './health/health.controller';
import { validateEnv } from './config/env.validation';

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
      cache: true,
      validate: validateEnv,
    }),
    LoggerModule.forRoot({
      pinoHttp: {
        level: process.env.LOG_LEVEL ?? 'info',
        // pino-pretty só em dev; em prod sai JSON estruturado
        transport:
          process.env.NODE_ENV === 'development'
            ? { target: 'pino-pretty', options: { singleLine: true } }
            : undefined,
        // Propaga/gera x-request-id por request
        genReqId: (req, res) => {
          const existing = (req.headers['x-request-id'] as string) || randomUUID();
          res.setHeader('x-request-id', existing);
          return existing;
        },
        // Nunca logar credenciais
        redact: ['req.headers.authorization', 'req.headers.cookie', 'res.headers["set-cookie"]'],
      },
    }),
    ThrottlerModule.forRoot([
      {
        name: 'default',
        ttl: Number(process.env.THROTTLE_TTL ?? 60) * 1000,
        limit: Number(process.env.THROTTLE_LIMIT ?? 100),
      },
    ]),
    ScheduleModule.forRoot(),
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
    NotificationModule,
    AdminModule,
    BroadcastModule,
    ProfileModule,
  ],
  controllers: [HealthController],
  providers: [
    {
      provide: APP_GUARD,
      useClass: ThrottlerGuard,
    },
    {
      // Reporta 5xx ao Sentry mantendo a formatação de erro padrão do Nest
      provide: APP_FILTER,
      useClass: SentryExceptionFilter,
    },
  ],
})
export class AppModule {}
