import * as Sentry from "@sentry/tanstackstart-react"
import { createIsomorphicFn } from "@tanstack/react-start"

const initSentry = createIsomorphicFn()
  .client(() => {
    Sentry.init({
      dsn: import.meta.env.VITE_SENTRY_DSN,
      environment: import.meta.env.MODE,
      sendDefaultPii: true,
      integrations: [
        Sentry.browserTracingIntegration(),
        Sentry.replayIntegration(),
      ],
      tracesSampleRate: 1.0,
      replaysSessionSampleRate: 0.1,
      replaysOnErrorSampleRate: 1.0,
    })
  })
  .server(() => {})

initSentry()
