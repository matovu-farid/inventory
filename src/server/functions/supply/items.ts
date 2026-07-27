import { createServerFn } from '@tanstack/react-start'
import { eq, ilike } from 'drizzle-orm'
import { z } from 'zod'
import { db } from '#/db'
import { supplyRouteLines, items, itemColors } from '#/db/schema'
import { requireSessionAndRole } from '#/server/middleware/rbac'
import {
  materializeSplitRows,
  materializeVariantRows,
  variantInput,
} from './items-internals'

export type { MaterializedRow } from './items-internals'

export const addSupplyRouteVariants = createServerFn()
  .inputValidator(variantInput)
  .handler(async ({ data }) => {
    await requireSessionAndRole(['admin'])
    const rows = materializeVariantRows(data)
    return db.insert(supplyRouteLines).values(rows).returning()
  })

export const deleteSupplyRouteItem = createServerFn()
  .inputValidator(z.object({ id: z.uuid() }))
  .handler(async ({ data }) => {
    await requireSessionAndRole(['admin'])
    await db.delete(supplyRouteLines).where(eq(supplyRouteLines.id, data.id))
  })

export const getItemNameSuggestions = createServerFn()
  .inputValidator(z.object({ query: z.string().min(1) }))
  .handler(async ({ data }) => {
    await requireSessionAndRole(['admin'])
    const like = `%${data.query}%`
    return db.query.items.findMany({
      where: ilike(items.name, like),
      limit: 20,
    })
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
        itemColorId: z.uuid(),
        size: z.string().min(1).optional(),
        quantity: z.number().int().positive(),
      }),
    )
    .min(1),
})

export const splitSupplyRouteItem = createServerFn()
  .inputValidator(splitInput)
  .handler(async ({ data }) => {
    await requireSessionAndRole(['admin'])

    return db.transaction(async (tx) => {
      const original = await tx.query.supplyRouteLines.findFirst({
        where: eq(supplyRouteLines.id, data.itemId),
      })
      if (!original) throw new Error('Supply route item not found')

      // We need an itemId to attach to each new row. Prefer the row's own
      // itemId; if missing (existing aggregate rows pre-migration), fall
      // back to the itemId reached through any color referenced in the
      // split (they should all belong to the same item).
      let itemIdFallback = original.itemId
      if (!itemIdFallback) {
        const firstColor = await tx.query.itemColors.findFirst({
          where: eq(itemColors.id, data.cells[0].itemColorId),
        })
        if (!firstColor) throw new Error('Color not found')
        itemIdFallback = firstColor.itemId
      }

      // Sanity check: all referenced colors belong to that item.
      const referencedColorIds = Array.from(
        new Set(data.cells.map((c) => c.itemColorId)),
      )
      const referencedColors = await tx.query.itemColors.findMany({
        where: (t, { inArray }) => inArray(t.id, referencedColorIds),
        columns: { id: true, itemId: true },
      })
      for (const c of referencedColors) {
        if (c.itemId !== itemIdFallback) {
          throw new Error('All colors in a split must belong to the same item')
        }
      }

      const rows = materializeSplitRows(
        {
          supplyRouteId: original.supplyRouteId,
          supplierId: original.supplierId,
          itemId: original.itemId,
          quantity: original.quantity,
          unitPriceForeign: original.unitPriceForeign,
          foreignCurrency: original.foreignCurrency,
          exchangeRateForeignToUsd: original.exchangeRateForeignToUsd,
          exchangeRateUsdToUgx: original.exchangeRateUsdToUgx,
        },
        itemIdFallback,
        data.cells,
      )

      await tx
        .delete(supplyRouteLines)
        .where(eq(supplyRouteLines.id, data.itemId))
      return tx.insert(supplyRouteLines).values(rows).returning()
    })
  })
