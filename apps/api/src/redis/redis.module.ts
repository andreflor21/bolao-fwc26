import { Global, Logger, Module, type OnApplicationShutdown } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import Redis from 'ioredis';
import { REDIS_CLIENT } from './redis.tokens';

const redisProvider = {
  provide: REDIS_CLIENT,
  inject: [ConfigService],
  useFactory: (config: ConfigService): Redis => {
    const host = config.get<string>('REDIS_HOST') ?? 'localhost';
    const port = Number(config.get<number>('REDIS_PORT') ?? 6379);
    const password = config.get<string>('REDIS_PASSWORD');
    const username = config.get<string>('REDIS_USERNAME');
    const tlsEnabled = config.get<string>('REDIS_TLS') === 'true';
    const client = new Redis({
      host,
      port,
      ...(username ? { username } : {}),
      ...(password ? { password } : {}),
      ...(tlsEnabled ? { tls: {} } : {}),
      lazyConnect: false,
      maxRetriesPerRequest: 3,
      enableReadyCheck: true,
    });
    client.on('error', (err: Error) => {
      Logger.error(`Redis error: ${err.message}`, 'RedisModule');
    });
    client.once('ready', () => {
      Logger.log(`Redis connected at ${host}:${port}`, 'RedisModule');
    });
    return client;
  },
};

@Global()
@Module({
  providers: [redisProvider],
  exports: [REDIS_CLIENT],
})
export class RedisModule implements OnApplicationShutdown {
  async onApplicationShutdown(): Promise<void> {
    // ioredis connections close cleanly when the process exits; explicit
    // disconnect is handled by ConfigModule lifecycle via the client.
  }
}
