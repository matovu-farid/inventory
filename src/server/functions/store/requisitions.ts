import { createServerFn } from "@tanstack/react-start"
import { and, eq, inArray, sql } from "drizzle-orm"
import { z } from "zod"
import { db } from "#/db"
import {
  restockRequisitions,
  supplyRouteItems,
  supplyRoutes,
} from "#/db/schema"
import { requireSession } from "#/server/middleware/auth"
import { requireRole } from "#/server/middleware/rbac"
import { formatProductLabel } from "#/lib/products"

export const listOpenRequisitions = createServerFn().handler(async () => {
  const session = await requireSession()
  requireRole(session, ["admin", "supervisor"])
  const rows = await db.query.restockRequisitions.findMany({
    where: eq(restockRequisitions.status, "open"),
    with: {
      store: true,
      productColor: { with: { product: true } },
    },
  })
  return rows.map((r) => ({
    id: r.id,
    storeId: r.storeId,
    storeName: r.store.name,
    productColorId: r.productColorId,
    size: r.size,
    productLabel: formatProductLabel(
      r.productColor.product.articleNumber,
      r.productColor.colorName,
      r.size,
    ),
    suggestedQuantity: r.suggestedQuantity,
    baseline: r.baselineQuantity,
    quantityAtOpen: r.quantityAtOpen,
    openedAt: r.openedAt,
  }))
})

const promoteInput = z.object({
  requisitionIds: z.array(z.uuid()).min(1),
  supplyRouteId: z.uuid(),
  supplierId: z.uuid(),
})

export const promoteRequisitionsToRoute = createServerFn()
  .inputValidator(promoteInput)
  .handler(async ({ data }) => {
    const session = await requireSession()
    requireRole(session, ["admin"])

    return db.transaction(async (tx) => {
      // Lock target requisitions
      const target = await tx
        .select()
        .from(restockRequisitions)
        .where(inArray(restockRequisitions.id, data.requisitionIds))
        .for("update")

      const stillOpen = target.filter((r) => r.status === "open")
      if (stillOpen.length !== target.length) {
        throw new Error(
          "Some requisitions are no longer open (already planned or dismissed).",
        )
      }

      const route = (
        await tx
          .select()
          .from(supplyRoutes)
          .where(eq(supplyRoutes.id, data.supplyRouteId))
      ).at(0)
      if (!route || route.status !== "planning") {
        throw new Error("Supply route must be in 'planning' status.")
      }

      for (const req of stillOpen) {
        const [item] = await tx
          .insert(supplyRouteItems)
          .values({
            supplyRouteId: data.supplyRouteId,
            supplierId: data.supplierId,
            productColorId: req.productColorId,
            // productId set via subquery on item_colors (table renamed from
            // product_colors in #3; the FK column item_id was previously
            // named product_id and renamed in the same migration).
            productId: sql`(SELECT item_id FROM item_colors WHERE id = ${req.productColorId})`,
            size: req.size,
            quantity: req.suggestedQuantity,
            unitPriceForeign: "0",
            foreignCurrency: "RMB",
            totalAmountForeign: "0",
            totalCostUgx: "0",
          })
          .returning()
        await tx
          .update(restockRequisitions)
          .set({ status: "planned", supplyRouteItemId: item.id })
          .where(eq(restockRequisitions.id, req.id))
      }
      return { promoted: stillOpen.length }
    })
  })

const dismissInput = z.object({
  id: z.uuid(),
  reason: z.string().min(1).max(500),
})

export const dismissRequisition = createServerFn()
  .inputValidator(dismissInput)
  .handler(async ({ data }) => {
    const session = await requireSession()
    requireRole(session, ["admin", "supervisor"])
    await db
      .update(restockRequisitions)
      .set({
        status: "dismissed",
        dismissedReason: data.reason,
        resolvedAt: new Date(),
      })
      .where(
        and(
          eq(restockRequisitions.id, data.id),
          eq(restockRequisitions.status, "open"),
        ),
      )
    return { ok: true }
  })
