import 'reflect-metadata';
import { NestFactory } from '@nestjs/core';
import { FastifyAdapter, NestFastifyApplication } from '@nestjs/platform-fastify';
import { ValidationPipe, Logger } from '@nestjs/common';
import helmet from '@fastify/helmet';
import cookie from '@fastify/cookie';
import { AppModule } from './app.module';

async function bootstrap() {
  // `rawBody: true` makes Nest expose req.rawBody (Buffer) on every request,
  // which the Stripe webhook controller uses for HMAC signature verification.
  const app = await NestFactory.create<NestFastifyApplication>(
    AppModule,
    new FastifyAdapter({ logger: false, trustProxy: true }),
    { bufferLogs: true, rawBody: true },
  );

  await app.register(helmet, {
    contentSecurityPolicy: false,
  });
  await app.register(cookie, {
    secret: process.env.JWT_SECRET ?? 'change-me',
  });

  app.setGlobalPrefix('api/v1');
  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      forbidNonWhitelisted: true,
      transform: true,
      transformOptions: { enableImplicitConversion: true },
    }),
  );

  const webOrigin = process.env.WEB_ORIGIN ?? 'http://localhost:5173';
  app.enableCors({
    origin: webOrigin.split(',').map((s) => s.trim()),
    credentials: true,
  });

  const port = Number(process.env.API_PORT ?? 3001);
  const host = process.env.API_HOST ?? '0.0.0.0';
  await app.listen(port, host);

  Logger.log(`🚀 API ready at http://${host}:${port}/api/v1`, 'Bootstrap');
}

bootstrap().catch((err) => {
  console.error('Bootstrap failed:', err);
  process.exit(1);
});
