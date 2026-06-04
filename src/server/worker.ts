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

    // Single hourly trigger ("0 * * * *") — threshold check runs every hour;
    // daily digest runs once per day at 04:00 UTC (07:00 EAT). Collapsed from
    // two cron triggers to one to stay under Cloudflare's per-account 5-cron
    // limit on Workers Free; semantics are unchanged.
    if (now.getUTCHours() === 4) {
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
