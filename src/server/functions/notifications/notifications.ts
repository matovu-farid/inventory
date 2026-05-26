import { createServerFn } from '@tanstack/react-start'
import { and, desc, eq, inArray, isNull } from 'drizzle-orm'
import { z } from 'zod'
import { db } from '#/db'
import { notifications, shopSales, lowStockAlerts } from '#/db/schema'
import { shouldNotifyOverdueCredit } from '#/lib/notifications/thresholds'
import { emitToRoles } from '#/lib/notifications/emit'
import { formatUgxTotal } from '#/lib/format'
import { requireSession } from '#/server/middleware/auth'
import { requireRole } from '#/server/middleware/rbac'
import { OPEN_PAYMENT_STATUSES } from '#/lib/payment-status'
import { runThresholdChecksInternal } from '#/server/scheduled/run-threshold-checks'

export { emitToRoles } from '#/lib/notifications/emit'

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

const navTargetInput = z.object({ id: z.uuid() })

/**
 * Resolves a low-stock alert into the route a notification bell should
 * deep-link to. Returns scope + locationId so the bell can pick between
 * /shop/$shopId/restock and /store/restock-requisitions.
 */
export const getLowStockAlertNavTarget = createServerFn()
  .inputValidator(navTargetInput)
  .handler(async ({ data }) => {
    await requireSession()
    const row = (
      await db
        .select()
        .from(lowStockAlerts)
        .where(eq(lowStockAlerts.id, data.id))
    ).at(0)
    if (!row) throw new Error('Alert not found')
    return {
      scope: row.scope,
      locationId: row.locationId,
      variantId: row.variantId,
    }
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
  tenantDb: Parameters<typeof runThresholdChecksInternal>[0],
  now: Date,
): Promise<{ overdueEmitted: number }> {
  let overdueEmitted = 0

  const openCreditSales = await tenantDb
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
        await tenantDb.transaction(async (tx) => {
          await emitToRoles(tx, {
            kind: 'credit_overdue',
            title: `Overdue credit sale ${sale.documentNumber ?? sale.id.slice(0, 8)}`,
            body: `Outstanding balance ${formatUgxTotal(sale.outstandingBalance)} is past the ${OVERDUE_DAYS}-day window.`,
            roles: ['admin', 'supervisor'],
            entityType: 'shop_sale',
            entityId: sale.id,
          })
        })
        overdueEmitted++
      }
    } catch (error) {
      console.error('[runOverdueCreditChecks] sale failed', {
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
  requireRole(session, ['admin'])

  const now = new Date()
  const [stockSummary, creditSummary] = await Promise.all([
    runThresholdChecksInternal(db, now),
    runOverdueCreditChecks(db, now),
  ])

  return { ...stockSummary, ...creditSummary }
})
