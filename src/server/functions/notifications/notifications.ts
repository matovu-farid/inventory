import { createServerFn } from "@tanstack/react-start"
import { and, desc, eq, isNull, inArray } from "drizzle-orm"
import { z } from "zod"
import { db } from "#/db"
import { notifications, user, shopSales } from "#/db/schema"
import {
  DEFAULT_THRESHOLDS,
  shouldNotifyLowStock,
  shouldNotifyOverdueCredit
  
} from "#/lib/notifications/thresholds"
import type {Thresholds} from "#/lib/notifications/thresholds";
import { requireSession } from "#/server/middleware/auth"
import { requireRole } from "#/server/middleware/rbac"

type Tx = Parameters<Parameters<typeof db.transaction>[0]>[0]

interface EmitParams {
  kind: string
  title: string
  body: string
  audience: { roles: ("admin" | "supervisor" | "sales")[] }
  entityType?: string
  entityId?: string
}

export async function emitNotification(tx: Tx, params: EmitParams) {
  const recipients = await tx
    .select({ id: user.id })
    .from(user)
    .where(inArray(user.role, params.audience.roles))

  if (recipients.length === 0) return

  await tx.insert(notifications).values(
    recipients.map((r) => ({
      userId: r.id,
      kind: params.kind,
      title: params.title,
      body: params.body,
      entityType: params.entityType,
      entityId: params.entityId,
    })),
  )
}

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

const thresholdsSchema = z.object({
  lowStockUnits: z.number().int().nonnegative(),
  discrepancyPercent: z.number().nonnegative(),
  overdueDays: z.number().int().nonnegative(),
}) satisfies z.ZodType<Thresholds>

/**
 * Run threshold-based checks and emit notifications for matches.
 * Designed to be invoked by a scheduled job (e.g., a Cloudflare cron
 * trigger every 15 minutes). Idempotent for the day — repeat runs
 * will create duplicate notifications, so production callers should
 * dedupe at the trigger layer.
 */
export const runThresholdChecks = createServerFn()
  .inputValidator(z.object({ thresholds: thresholdsSchema.optional() }))
  .handler(async ({ data }) => {
    const session = await requireSession()
    requireRole(session, ["admin"])

    const thresholds: Thresholds = data.thresholds ?? DEFAULT_THRESHOLDS

    return db.transaction(async (tx) => {
      let lowStockEmitted = 0
      let overdueEmitted = 0

      // Low-stock per shop_stock row
      const allShopStock = await tx.query.shopStock.findMany({
        with: { productColor: { with: { product: true } } },
      })
      for (const s of allShopStock) {
        if (shouldNotifyLowStock(s.quantityOnHand, thresholds)) {
          const productLabel = `${s.productColor.product.articleNumber} ${s.productColor.colorName}/${s.size}`
          await emitNotification(tx, {
            kind: "low_stock",
            title: `Low stock: ${productLabel}`,
            body: `${productLabel} has ${s.quantityOnHand} units left at this shop.`,
            audience: { roles: ["admin", "supervisor"] },
            entityType: "shop_stock",
            entityId: s.id,
          })
          lowStockEmitted++
        }
      }

      // Overdue credit sales
      const now = new Date()
      const openCreditSales = await tx
        .select()
        .from(shopSales)
        .where(inArray(shopSales.paymentStatus, ["open", "partially_paid"]))
      for (const sale of openCreditSales) {
        if (
          shouldNotifyOverdueCredit(
            sale.saleDate,
            sale.paymentStatus,
            now,
            thresholds,
          )
        ) {
          await emitNotification(tx, {
            kind: "credit_overdue",
            title: `Overdue credit sale ${sale.documentNumber ?? sale.id.slice(0, 8)}`,
            body: `Outstanding balance ${sale.outstandingBalance} UGX is past the ${thresholds.overdueDays}-day window.`,
            audience: { roles: ["admin", "supervisor"] },
            entityType: "shop_sale",
            entityId: sale.id,
          })
          overdueEmitted++
        }
      }

      return { lowStockEmitted, overdueEmitted }
    })
  })
