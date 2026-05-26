import { createServerFn } from "@tanstack/react-start"
import { eq, ilike } from "drizzle-orm"
import { z } from "zod"
import { db } from "#/db"
import { supplyRouteItems, items, itemColors } from "#/db/schema"
import { requireSession } from "#/server/middleware/auth"
import { requireRole } from "#/server/middleware/rbac"
import {
  materializeSplitRows,
  materializeVariantRows,
  variantInput,
} from "./items-internals"

export type { MaterializedRow } from "./items-internals"

export const addSupplyRouteVariants = createServerFn()
  .inputValidator(variantInput)
  .handler(async ({ data }) => {
    const session = await requireSession()
    requireRole(session, ["admin"])
    const rows = materializeVariantRows(data)
    return db.insert(supplyRouteItems).values(rows).returning()
  })

export const deleteSupplyRouteItem = createServerFn()
  .inputValidator(z.object({ id: z.uuid() }))
  .handler(async ({ data }) => {
    const session = await requireSession()
    requireRole(session, ["admin"])
    await db.delete(supplyRouteItems).where(eq(supplyRouteItems.id, data.id))
  })

export const getProductNameSuggestions = createServerFn()
  .inputValidator(z.object({ query: z.string().min(1) }))
  .handler(async ({ data }) => {
    const session = await requireSession()
    requireRole(session, ["admin"])
    const like = `%${data.query}%`
    return db.query.items.findMany({ where: ilike(items.name, like), limit: 20 })
  })

/**
 * Task 2: split an aggregate or color-only supply item into N full
 * (color + size) variant rows. The sum of the new quantities must match the
 * original quantity. Runs inside a transaction so the original row never
 * disappears without its replacements being in place.
 */
const splitInput = z.object({
  itemId: z.uuid(),
  cells: z
    .array(
      z.object({
        productColorId: z.uuid(),
        size: z.string().min(1).optional(),
        quantity: z.number().int().positive(),
      }),
    )
    .min(1),
})

export const splitSupplyRouteItem = createServerFn()
  .inputValidator(splitInput)
  .handler(async ({ data }) => {
    const session = await requireSession()
    requireRole(session, ["admin"])

    return db.transaction(async (tx) => {
      const original = await tx.query.supplyRouteItems.findFirst({
        where: eq(supplyRouteItems.id, data.itemId),
      })
      if (!original) throw new Error("Supply route item not found")

      // We need a productId to attach to each new row. Prefer the row's own
      // productId; if missing (existing aggregate rows pre-migration), fall
      // back to the productId reached through any productColor referenced in
      // the split (they should all belong to the same product).
      let productIdFallback = original.productId
      if (!productIdFallback) {
        const firstColor = await tx.query.itemColors.findFirst({
          where: eq(itemColors.id, data.cells[0].productColorId),
        })
        if (!firstColor) throw new Error("Color not found")
        productIdFallback = firstColor.itemId
      }

      // Sanity check: all referenced colors belong to that product.
      const referencedColorIds = Array.from(
        new Set(data.cells.map((c) => c.productColorId)),
      )
      const referencedColors = await tx.query.itemColors.findMany({
        where: (t, { inArray }) => inArray(t.id, referencedColorIds),
        columns: { id: true, itemId: true },
      })
      for (const c of referencedColors) {
        if (c.itemId !== productIdFallback) {
          throw new Error(
            "All colors in a split must belong to the same product",
          )
        }
      }

      const rows = materializeSplitRows(
        {
          supplyRouteId: original.supplyRouteId,
          supplierId: original.supplierId,
          productId: original.productId,
          quantity: original.quantity,
          unitPriceForeign: original.unitPriceForeign,
          foreignCurrency: original.foreignCurrency,
          exchangeRateForeignToUsd: original.exchangeRateForeignToUsd,
          exchangeRateUsdToUgx: original.exchangeRateUsdToUgx,
        },
        productIdFallback,
        data.cells,
      )

      await tx
        .delete(supplyRouteItems)
        .where(eq(supplyRouteItems.id, data.itemId))
      return tx.insert(supplyRouteItems).values(rows).returning()
    })
  })
