import { describe, expect, it } from 'vitest'

import { getCloudflareSentryOptions } from '#/lib/sentry-config'

describe('getCloudflareSentryOptions', () => {
  it('uses the Worker DSN and identifies the Worker environment', () => {
    expect(
      getCloudflareSentryOptions({
        SENTRY_DSN: 'https://worker-dsn@example.ingest.sentry.io/1',
      }),
    ).toEqual({
      dsn: 'https://worker-dsn@example.ingest.sentry.io/1',
      environment: 'production-worker',
      sendDefaultPii: true,
    })
  })
})
