import { createEnv } from "@t3-oss/env-core"
import { z } from "zod"

export const env = createEnv({
  server: {
    DATABASE_URL: z.string().url(),
    BETTER_AUTH_SECRET: z.string().min(1),
    BETTER_AUTH_URL: z.string().url().optional(),
    ELECTRIC_URL: z.string().url().optional(),
    SENTRY_DSN: z.string().optional(),
    RESEND_API_KEY: z.string().min(1),
    EMAIL_FROM: z.string().min(1).optional(),
    APP_URL: z.string().url(),
  },
  clientPrefix: "VITE_",
  client: {
    VITE_APP_TITLE: z.string().min(1).optional(),
  },
  runtimeEnv: import.meta.env,
  emptyStringAsUndefined: true,
})
