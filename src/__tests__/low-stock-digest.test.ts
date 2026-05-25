import { describe, it, expect, beforeEach, vi } from "vitest"
import { db } from "#/db"
import { eq } from "drizzle-orm"
import { lowStockAlerts } from "#/db/schema"
import { sendDailyLowStockDigestInternal } from "#/server/scheduled/send-low-stock-digest"
import type * as EmailModule from "#/lib/email"

vi.mock("#/lib/email", async (orig) => {
  const mod = await orig<typeof EmailModule>()
  return {
    ...mod,
    sendLowStockDigest: vi.fn(async () => {}),
  }
})

describe("sendDailyLowStockDigestInternal", () => {
  beforeEach(async () => {
    // Resolve any open alerts left by other tests so this run sees zero.
    await db
      .update(lowStockAlerts)
      .set({ status: "resolved", resolvedAt: new Date() })
      .where(eq(lowStockAlerts.status, "open"))
  })

  it("returns zero counts and does not call Resend when no open alerts", async () => {
    const email = await import("#/lib/email")
    const result = await sendDailyLowStockDigestInternal(db, new Date())
    expect(result).toEqual({
      emailsSent: 0,
      alertCount: 0,
      recipientCount: 0,
    })
    expect(email.sendLowStockDigest).not.toHaveBeenCalled()
  })
})
