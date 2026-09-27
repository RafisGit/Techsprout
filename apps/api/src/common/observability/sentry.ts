import * as Sentry from '@sentry/node';
import { env } from '../../config/env.config';

export function initSentry() {
  const dsn = process.env.SENTRY_DSN;
  if (dsn) {
    Sentry.init({
      dsn,
      environment: env.NODE_ENV,
      release: 'techsprout-api@0.1.0',
      tracesSampleRate: env.NODE_ENV === 'production' ? 0.2 : 1.0,
    });
  }
}

export { Sentry };
