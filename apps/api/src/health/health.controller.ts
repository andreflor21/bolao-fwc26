import { Controller, Get, Query } from '@nestjs/common';
import { Public } from '../auth/decorators/public.decorator';

@Controller('health')
export class HealthController {
  @Public()
  @Get()
  check(@Query('sentry-test') sentryTest?: string) {
    // Gatilho de diagnóstico: GET /health?sentry-test=1 lança um erro de
    // propósito (→ 500 → SentryExceptionFilter reporta). Serve só pra
    // confirmar que o Sentry do backend está recebendo. Sem o param, no-op.
    if (sentryTest === '1') {
      throw new Error('Sentry test error — disparado via /health?sentry-test=1 (ignorar)');
    }
    return {
      status: 'ok',
      timestamp: new Date().toISOString(),
      version: process.env.APP_VERSION ?? '0.1.0',
    };
  }
}
