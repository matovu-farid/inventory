export interface CloudflareSentryEnv {
  SENTRY_DSN?: string
}

export function getCloudflareSentryOptions(env: CloudflareSentryEnv) {
  return {
    dsn: env.SENTRY_DSN,
    environment: 'production-worker',
    sendDefaultPii: true,
  }
}
