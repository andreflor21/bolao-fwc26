import { ArgumentsHost, Catch, HttpException } from '@nestjs/common';
import { BaseExceptionFilter } from '@nestjs/core';
import * as Sentry from '@sentry/node';

/**
 * Reporta exceções 5xx (e erros não-HTTP) ao Sentry e delega a formatação da
 * resposta pro filtro padrão do Nest (BaseExceptionFilter), preservando o
 * comportamento atual de erro. 4xx (validação, auth, conflito) não vão pro
 * Sentry — são esperados.
 */
@Catch()
export class SentryExceptionFilter extends BaseExceptionFilter {
  override catch(exception: unknown, host: ArgumentsHost): void {
    const status = exception instanceof HttpException ? exception.getStatus() : 500;
    if (status >= 500) {
      Sentry.captureException(exception);
    }
    super.catch(exception, host);
  }
}
