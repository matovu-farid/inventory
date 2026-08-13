import * as Sentry from '@sentry/tanstackstart-react'

const sentryDsn = process.env.SENTRY_DSN

if (!sentryDsn) {
  console.warn('SENTRY_DSN is not defined. Sentry is not running.')
} else {
  Sentry.init({
    dsn: sentryDsn,
    environment:
      process.env.NODE_ENV === 'production' ? 'production' : 'development',
    // Adds request headers and IP for users, for more info visit:
    // https://docs.sentry.io/platforms/javascript/guides/tanstackstart-react/configuration/options/#sendDefaultPii
    sendDefaultPii: true,
    tracesSampleRate: 1.0,
    replaysSessionSampleRate: 1.0,
    replaysOnErrorSampleRate: 1.0,
  })
}
