import { createServerFn } from '@tanstack/react-start'
import { eq, ilike } from 'drizzle-orm'
import BigNumber from 'bignumber.js'
import { z } from 'zod'
import { db } from '#/db'
import {
  supplyRouteLines,
  items,
  itemColors,
  supplyRoutes,
  storeReceivings,
} from '#/db/schema'
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
    const [item, route] = await Promise.all([
      db.query.items.findFirst({ where: eq(items.id, data.itemId) }),
      db.query.supplyRoutes.findFirst({
        where: eq(supplyRoutes.id, data.supplyRouteId),
      }),
    ])
    if (!item) throw new Error('Item not found')
    if (!route) throw new Error('Supply route not found')
    if (
      !item.supplierId ||
      !item.costPrice ||
      !item.costCurrency ||
      !item.minimumSellPriceUgx ||
      Number(item.minimumSellPriceUgx) <= 0
    ) {
      throw new Error(
        'Configure the item supplier, cost, currency, and minimum sell price before purchasing it',
      )
    }
    const exchangeRateForeignToUsd =
      data.exchangeRateForeignToUsd ??
      (item.costCurrency === 'RMB'
        ? (route.rateRmbPerUsd ?? undefined)
        : undefined)
    const exchangeRateUsdToUgx =
      data.exchangeRateUsdToUgx ??
      (item.costCurrency !== 'UGX'
        ? (route.rateUgxPerUsd ?? undefined)
        : undefined)
    if (item.costCurrency === 'RMB' && !exchangeRateForeignToUsd)
      throw new Error('Set the RMB/USD route rate or provide a line override')
    if (item.costCurrency !== 'UGX' && !exchangeRateUsdToUgx)
      throw new Error('Set the USD/UGX route rate or provide a line override')
    const rows = materializeVariantRows({
      ...data,
      supplierId: item.supplierId,
      unitPriceForeign: item.costPrice,
      foreignCurrency: item.costCurrency,
      minimumSellPriceUgx: item.minimumSellPriceUgx,
      exchangeRateForeignToUsd,
      exchangeRateUsdToUgx,
    })
    return db.insert(supplyRouteLines).values(rows).returning()
  })

export const deleteSupplyRouteItem = createServerFn()
  .inputValidator(z.object({ id: z.uuid() }))
  .handler(async ({ data }) => {
    await requireSessionAndRole(['admin'])
    const line = await db.query.supplyRouteLines.findFirst({
      where: eq(supplyRouteLines.id, data.id),
      with: { supplyRoute: true },
    })
    if (!line) throw new Error('Supply route line not found')
    if (line.supplyRoute.status !== 'planning')
      throw new Error('Only planning routes can be edited')
    const received = await db.query.storeReceivings.findFirst({
      where: eq(storeReceivings.supplyRouteLineId, data.id),
    })
    if (received) throw new Error('Received lines cannot be deleted')
    await db.delete(supplyRouteLines).where(eq(supplyRouteLines.id, data.id))
  })

export const updateSupplyRouteLineQuantity = createServerFn()
  .inputValidator(
    z.object({ id: z.uuid(), quantity: z.number().int().positive() }),
  )
  .handler(async ({ data }) => {
    await requireSessionAndRole(['admin'])
    return db.transaction(async (tx) => {
      const line = await tx.query.supplyRouteLines.findFirst({
        where: eq(supplyRouteLines.id, data.id),
        with: { supplyRoute: true },
      })
      if (!line) throw new Error('Supply route line not found')
      if (line.supplyRoute.status !== 'planning')
        throw new Error('Only planning routes can be edited')
      const received = await tx.query.storeReceivings.findFirst({
        where: eq(storeReceivings.supplyRouteLineId, data.id),
      })
      if (received) throw new Error('Received lines cannot be edited')
      const unit = new BigNumber(line.unitPriceForeign)
      const totalForeign = unit.times(data.quantity).toFixed(2)
      const isUgx = line.foreignCurrency === 'UGX'
      const isUsd = line.foreignCurrency === 'USD'
      const totalUsd = isUgx
        ? null
        : isUsd
          ? totalForeign
          : new BigNumber(totalForeign)
              .div(line.exchangeRateForeignToUsd ?? '1')
              .toFixed(2)
      const totalCostUgx = isUgx
        ? totalForeign
        : new BigNumber(totalForeign)
            .div(isUsd ? '1' : (line.exchangeRateForeignToUsd ?? '1'))
            .times(line.exchangeRateUsdToUgx ?? '1')
            .toFixed(2)
      return tx
        .update(supplyRouteLines)
        .set({
          quantity: data.quantity,
          totalAmountForeign: totalForeign,
          totalAmountUsd: totalUsd,
          totalCostUgx,
        })
        .where(eq(supplyRouteLines.id, data.id))
        .returning()
    })
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
          minimumSellPriceUgx: original.minimumSellPriceUgx,
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
