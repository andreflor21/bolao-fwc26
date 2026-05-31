// Sentry deve inicializar ANTES de qualquer import instrumentado — por isso
// este arquivo é o PRIMEIRO import do main.ts. No-op se SENTRY_DSN não estiver
// setado (dev/CI), então é seguro deixar sempre importado.
import 'dotenv/config';
import * as Sentry from '@sentry/node';
import { nodeProfilingIntegration } from '@sentry/profiling-node';

const dsn = process.env.SENTRY_DSN;

if (dsn) {
  Sentry.init({
    dsn,
    environment: process.env.SENTRY_ENVIRONMENT ?? process.env.NODE_ENV ?? 'production',
    integrations: [nodeProfilingIntegration()],
    // amostragem conservadora — ajuste por ambiente se precisar de mais traces
    tracesSampleRate: process.env.NODE_ENV === 'production' ? 0.1 : 1.0,
    profilesSampleRate: 0.1,
  });
}

export const sentryEnabled = Boolean(dsn);
