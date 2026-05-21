import { createServerFn } from "@tanstack/react-start"
import { and, desc, eq, inArray, isNull } from "drizzle-orm"
import { z } from "zod"
import { db } from "#/db"
import { notifications, shopSales } from "#/db/schema"
import { shouldNotifyOverdueCredit } from "#/lib/notifications/thresholds"
import { emitToRoles } from "#/lib/notifications/emit"
import { requireSession } from "#/server/middleware/auth"
import { requireRole } from "#/server/middleware/rbac"
import { OPEN_PAYMENT_STATUSES } from "#/lib/payment-status"
import { runThresholdChecksInternal } from "#/server/scheduled/run-threshold-checks"

export { emitToRoles } from "#/lib/notifications/emit"

export const listMyNotifications = createServerFn().handler(async () => {
  const session = await requireSession()
  const userId = session.user.id

  return db
    .select()
    .from(notifications)
    .where(and(eq(notifications.userId, userId), isNull(notifications.readAt)))
    .orderBy(desc(notifications.createdAt))
    .limit(50)
})

const markReadInput = z.object({ id: z.uuid() })

export const markNotificationRead = createServerFn()
  .inputValidator(markReadInput)
  .handler(async ({ data }) => {
    const session = await requireSession()
    const userId = session.user.id

    await db
      .update(notifications)
      .set({ readAt: new Date() })
      .where(
        and(eq(notifications.id, data.id), eq(notifications.userId, userId)),
      )
    return { ok: true }
  })

// TODO(Task 9): make OVERDUE_DAYS configurable via notification_thresholds
const OVERDUE_DAYS = 30

async function runOverdueCreditChecks(
  db: Parameters<typeof runThresholdChecksInternal>[0],
  now: Date,
): Promise<{ overdueEmitted: number }> {
  let overdueEmitted = 0

  const openCreditSales = await db
    .select()
    .from(shopSales)
    .where(inArray(shopSales.paymentStatus, OPEN_PAYMENT_STATUSES))

  for (const sale of openCreditSales) {
    try {
      if (
        shouldNotifyOverdueCredit(sale.saleDate, sale.paymentStatus, now, {
          overdueDays: OVERDUE_DAYS,
        })
      ) {
        await db.transaction(async (tx) => {
          await emitToRoles(tx, {
            kind: "credit_overdue",
            title: `Overdue credit sale ${sale.documentNumber ?? sale.id.slice(0, 8)}`,
            body: `Outstanding balance ${sale.outstandingBalance} UGX is past the ${OVERDUE_DAYS}-day window.`,
            roles: ["admin", "supervisor"],
            entityType: "shop_sale",
            entityId: sale.id,
          })
        })
        overdueEmitted++
      }
    } catch (error) {
      console.error("[runOverdueCreditChecks] sale failed", {
        saleId: sale.id,
        error,
      })
    }
  }

  return { overdueEmitted }
}

/**
 * Admin-triggered "Run check now" button. Runs both the lifecycle-based
 * low-stock threshold engine and the legacy overdue-credit check.
 */
export const runThresholdChecksNow = createServerFn().handler(async () => {
  const session = await requireSession()
  requireRole(session, ["admin"])

  const now = new Date()
  const [stockSummary, creditSummary] = await Promise.all([
    runThresholdChecksInternal(db, now),
    runOverdueCreditChecks(db, now),
  ])

  return { ...stockSummary, ...creditSummary }
})
