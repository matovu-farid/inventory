// Custom Cloudflare Workers entry that wraps TanStack Start's default handler
// and adds a scheduled (cron) handler for low-stock notifications.
//
// TanStack Start v1 exports a default object with a `fetch` method from
// @tanstack/react-start/server-entry — confirmed in dist/default-entry/esm/server.js.

import tanstackHandler from "@tanstack/react-start/server-entry"
import { db } from "#/db"
import { runThresholdChecksInternal } from "#/server/scheduled/run-threshold-checks"
import { sendDailyLowStockDigestInternal } from "#/server/scheduled/send-low-stock-digest"

// Minimal Cloudflare Workers types (no @cloudflare/workers-types dep needed).
interface ScheduledEvent {
  scheduledTime: number
  cron: string
}
interface ExecutionContext {
  waitUntil: (promise: Promise<unknown>) => void
}

export default {
  fetch: tanstackHandler.fetch.bind(tanstackHandler),

  scheduled: (
    event: ScheduledEvent,
    _env: unknown,
    ctx: ExecutionContext,
  ): void => {
    const now = new Date(event.scheduledTime)

    // 0 4 * * * (daily 04:00 UTC = 07:00 EAT) → threshold check + digest
    // 0 * * * * (hourly)                       → threshold check only
    if (event.cron === "0 4 * * *") {
      ctx.waitUntil(
        (async () => {
          await runThresholdChecksInternal(db, now)
          await sendDailyLowStockDigestInternal(db, now)
        })(),
      )
    } else {
      ctx.waitUntil(runThresholdChecksInternal(db, now))
    }
  },
}
