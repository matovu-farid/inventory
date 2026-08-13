// Custom Cloudflare Workers entry that wraps TanStack Start's default handler
// and adds a scheduled (cron) handler for low-stock notifications.
//
// TanStack Start v1 exports a default object with a `fetch` method from
// @tanstack/react-start/server-entry — confirmed in dist/default-entry/esm/server.js.

import * as Sentry from '@sentry/cloudflare'
import tanstackHandler from '@tanstack/react-start/server-entry'
import { db, withRequestDb } from '#/db'
import { runThresholdChecksInternal } from '#/server/scheduled/run-threshold-checks'
import { sendDailyLowStockDigestInternal } from '#/server/scheduled/send-low-stock-digest'
import { getCloudflareSentryOptions } from '#/lib/sentry-config'

// Minimal Cloudflare Workers types (no @cloudflare/workers-types dep needed).
interface ScheduledEvent {
  scheduledTime: number
  cron: string
}
interface ExecutionContext {
  waitUntil: (promise: Promise<unknown>) => void
}

interface WorkerEnv {
  SENTRY_DSN?: string
}

async function runScheduledChecks(
  now: Date,
  waitUntil: (promise: Promise<unknown>) => void,
): Promise<void> {
  await withRequestDb(async () => {
    if (now.getUTCHours() === 4) {
      await runThresholdChecksInternal(db, now)
      await sendDailyLowStockDigestInternal(db, now)
    } else {
      await runThresholdChecksInternal(db, now)
    }
  }, waitUntil)
}

const workerHandler = {
  fetch(
    request: Request,
    env: WorkerEnv,
    ctx: ExecutionContext,
  ): Promise<Response> {
    return withRequestDb(async () => {
      const handler = tanstackHandler as unknown as {
        fetch: (...args: unknown[]) => Response | Promise<Response>
      }
      return handler.fetch(request, env, ctx)
    }, ctx.waitUntil.bind(ctx))
  },

  scheduled: (
    event: ScheduledEvent,
    _env: WorkerEnv,
    ctx: ExecutionContext,
  ): void => {
    const now = new Date(event.scheduledTime)
    ctx.waitUntil(runScheduledChecks(now, ctx.waitUntil.bind(ctx)))
  },
}

export default Sentry.withSentry(getCloudflareSentryOptions, workerHandler)
