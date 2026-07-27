import { createEnv } from '@t3-oss/env-core'
import { z } from 'zod'

export const env = createEnv({
  server: {
    DATABASE_URL: z.url(),
    BETTER_AUTH_SECRET: z.string().min(1),
    BETTER_AUTH_URL: z.url().optional(),
    ELECTRIC_URL: z.url().optional(),
    SENTRY_DSN: z.string().optional(),
    RESEND_API_KEY: z.string().min(1),
    EMAIL_FROM: z.string().min(1).optional(),
    APP_URL: z.url(),
    AWS_ACCESS_KEY_ID: z.string().min(1),
    AWS_SECRET_ACCESS_KEY: z.string().min(1),
    AWS_REGION: z.string().min(1),
    S3_PRODUCT_BUCKET: z.string().min(1),
    MOCK_EMAILS: z.string().optional(),
  },
  clientPrefix: 'VITE_',
  client: {
    VITE_APP_TITLE: z.string().min(1).optional(),
  },
  // Server keys come from process.env (loaded by dotenv-cli in dev, from Worker
  // bindings in prod). VITE_* client keys are statically replaced by Vite via
  // import.meta.env at build time. Per t3-oss docs, the canonical pattern when
  // a bundler does static replacement is to destructure each key explicitly.
  runtimeEnv: {
    DATABASE_URL: process.env.DATABASE_URL,
    BETTER_AUTH_SECRET: process.env.BETTER_AUTH_SECRET,
    BETTER_AUTH_URL: process.env.BETTER_AUTH_URL,
    ELECTRIC_URL: process.env.ELECTRIC_URL,
    SENTRY_DSN: process.env.SENTRY_DSN,
    RESEND_API_KEY: process.env.RESEND_API_KEY,
    EMAIL_FROM: process.env.EMAIL_FROM,
    APP_URL: process.env.APP_URL,
    AWS_ACCESS_KEY_ID: process.env.AWS_ACCESS_KEY_ID,
    AWS_SECRET_ACCESS_KEY: process.env.AWS_SECRET_ACCESS_KEY,
    AWS_REGION: process.env.AWS_REGION,
    S3_PRODUCT_BUCKET: process.env.S3_PRODUCT_BUCKET,
    MOCK_EMAILS: process.env.MOCK_EMAILS,
    VITE_APP_TITLE: import.meta.env.VITE_APP_TITLE,
  },
  emptyStringAsUndefined: true,
})
