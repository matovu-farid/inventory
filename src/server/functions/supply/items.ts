import { createServerFn } from '@tanstack/react-start'
import { and, eq, ilike, inArray, isNull } from 'drizzle-orm'
import { z } from 'zod'
import { db } from '#/db'
import {
  supplyRouteLines,
  items,
  itemColors,
  suppliers,
  supplyRoutes,
  supplyRouteReceipts,
  storeReceivings,
} from '#/db/schema'
import { requireSessionAndRole } from '#/server/middleware/rbac'
import { formatItemArticleNumbers } from '#/lib/items/article-number'
import {
  materializeSplitRows,
  materializeVariantRows,
  calculateSupplyLineAmounts,
  variantInput,
} from './items-internals'
import { ensureSupplyRouteReceipt } from './receipts.server'

export type { MaterializedRow } from './items-internals'

export const addSupplyRouteVariants = createServerFn()
  .inputValidator(variantInput)
  .handler(async ({ data }) => {
    await requireSessionAndRole(['admin'])
    const [item, route] = await Promise.all([
      db.query.items.findFirst({
        where: eq(items.id, data.itemId),
        with: { articleNumbers: true },
      }),
      db.query.supplyRoutes.findFirst({
        where: eq(supplyRoutes.id, data.supplyRouteId),
      }),
    ])
    if (!item) throw new Error('Item not found')
    if (!route) throw new Error('Supply route not found')
    if (route.status !== 'open')
      throw new Error('Only open routes can be edited')
    const supplierId = data.supplierId ?? item.supplierId
    if (!supplierId) throw new Error('Select a supplier for this purchase')
    const supplier = await db.query.suppliers.findFirst({
      where: and(eq(suppliers.id, supplierId), isNull(suppliers.deletedAt)),
    })
    if (!supplier) throw new Error('Supplier not found')
    const colorIds = Array.from(
      new Set(
        data.cells.flatMap((cell) =>
          cell.itemColorId ? [cell.itemColorId] : [],
        ),
      ),
    )
    const colors = colorIds.length
      ? await db.query.itemColors.findMany({
          where: inArray(itemColors.id, colorIds),
          columns: { id: true, colorName: true },
        })
      : []
    if (
      !item.supplierId ||
      !item.costPrice ||
      Number(item.costPrice) <= 0 ||
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
      supplierId,
      unitPriceForeign: item.costPrice,
      foreignCurrency: item.costCurrency,
      minimumSellPriceUgx: item.minimumSellPriceUgx,
      exchangeRateForeignToUsd,
      exchangeRateUsdToUgx,
      supplierNameSnapshot: supplier.name,
      articleNumberSnapshot: formatItemArticleNumbers(item.articleNumbers),
      itemNameSnapshot: item.name,
      colorNameById: Object.fromEntries(
        colors.map((color) => [color.id, color.colorName]),
      ),
    })
    return db.transaction(async (tx) => {
      const receiptId = await ensureSupplyRouteReceipt(tx, {
        supplyRouteId: route.id,
        supplierId,
        sourceEntryId: rows[0].entryId,
        receiptDate: route.departureDate,
        foreignCurrency: item.costCurrency as 'RMB' | 'USD' | 'UGX',
        exchangeRateForeignToUsd,
        exchangeRateUsdToUgx,
      })
      return tx
        .insert(supplyRouteLines)
        .values(rows.map((row) => ({ ...row, receiptId })))
        .returning()
    })
  })

const replaceSupplyRouteEntryInput = variantInput.extend({
  entryId: z.uuid(),
})

/**
 * Replaces one editable purchase entry atomically. An entry may materialize
 * into several route lines, so receipt checks are made against every member
 * before any row is removed.
 */
export const replaceSupplyRouteEntry = createServerFn()
  .inputValidator(replaceSupplyRouteEntryInput)
  .handler(async ({ data }) => {
    await requireSessionAndRole(['admin'])
    return db.transaction(async (tx) => {
      const existing = await tx.query.supplyRouteLines.findMany({
        where: and(
          eq(supplyRouteLines.supplyRouteId, data.supplyRouteId),
          eq(supplyRouteLines.entryId, data.entryId),
        ),
        with: { supplyRoute: true },
      })
      if (existing.length === 0) throw new Error('Supply route entry not found')
      if (existing[0].supplyRoute.status !== 'open')
        throw new Error('Only open routes can be edited')
      const received = await tx.query.storeReceivings.findFirst({
        where: inArray(
          storeReceivings.supplyRouteLineId,
          existing.map((line) => line.id),
        ),
      })
      if (received) throw new Error('Received entries cannot be replaced')

      const item = await tx.query.items.findFirst({
        where: and(eq(items.id, data.itemId), isNull(items.deletedAt)),
        with: { articleNumbers: true },
      })
      if (!item) throw new Error('Item not found')
      const snapshot =
        existing[0].itemId === data.itemId
          ? {
              unitPriceForeign: existing[0].unitPriceForeign,
              foreignCurrency: existing[0].foreignCurrency,
              minimumSellPriceUgx: existing[0].minimumSellPriceUgx,
            }
          : {
              unitPriceForeign: item.costPrice,
              foreignCurrency: item.costCurrency,
              minimumSellPriceUgx: item.minimumSellPriceUgx,
            }
      const supplierId = data.supplierId ?? existing[0].supplierId
      if (!supplierId) throw new Error('Select a supplier for this purchase')
      const supplier = await tx.query.suppliers.findFirst({
        where: and(eq(suppliers.id, supplierId), isNull(suppliers.deletedAt)),
      })
      if (!supplier) throw new Error('Supplier not found')
      const colorIds = Array.from(
        new Set(
          data.cells.flatMap((cell) =>
            cell.itemColorId ? [cell.itemColorId] : [],
          ),
        ),
      )
      const colors = colorIds.length
        ? await tx.query.itemColors.findMany({
            where: inArray(itemColors.id, colorIds),
            columns: { id: true, colorName: true },
          })
        : []
      const colorNameById = Object.fromEntries(
        colors.map((color) => [color.id, color.colorName]),
      )
      if (existing[0].itemId === data.itemId) {
        for (const line of existing) {
          if (line.colorId && line.colorNameSnapshot) {
            colorNameById[line.colorId] = line.colorNameSnapshot
          }
        }
      }
      if (
        !snapshot.unitPriceForeign ||
        !snapshot.foreignCurrency ||
        !snapshot.minimumSellPriceUgx ||
        Number(snapshot.minimumSellPriceUgx) <= 0
      ) {
        throw new Error(
          'Configure the item supplier, cost, currency, and minimum sell price before purchasing it',
        )
      }
      const foreignRate =
        data.exchangeRateForeignToUsd ??
        (snapshot.foreignCurrency === 'RMB'
          ? (existing[0].exchangeRateForeignToUsd ??
            (existing[0].itemId === data.itemId
              ? undefined
              : (existing[0].supplyRoute.rateRmbPerUsd ?? undefined)))
          : undefined)
      const usdRate =
        data.exchangeRateUsdToUgx ??
        (snapshot.foreignCurrency !== 'UGX'
          ? (existing[0].exchangeRateUsdToUgx ??
            (existing[0].itemId === data.itemId
              ? undefined
              : (existing[0].supplyRoute.rateUgxPerUsd ?? undefined)))
          : undefined)
      if (snapshot.foreignCurrency === 'RMB' && !foreignRate)
        throw new Error('Set the RMB/USD route rate or provide a line override')
      if (snapshot.foreignCurrency !== 'UGX' && !usdRate)
        throw new Error('Set the USD/UGX route rate or provide a line override')

      const rows = materializeVariantRows({
        ...data,
        supplierId,
        unitPriceForeign: snapshot.unitPriceForeign,
        foreignCurrency: snapshot.foreignCurrency,
        minimumSellPriceUgx: snapshot.minimumSellPriceUgx,
        exchangeRateForeignToUsd: foreignRate,
        exchangeRateUsdToUgx: usdRate,
        supplierNameSnapshot:
          existing[0].supplierId === supplierId
            ? (existing[0].supplierNameSnapshot ?? supplier.name)
            : supplier.name,
        articleNumberSnapshot:
          existing[0].itemId === data.itemId
            ? (existing[0].articleNumberSnapshot ??
              formatItemArticleNumbers(item.articleNumbers))
            : formatItemArticleNumbers(item.articleNumbers),
        itemNameSnapshot:
          existing[0].itemId === data.itemId
            ? (existing[0].itemNameSnapshot ?? item.name)
            : item.name,
        colorNameById,
      })
      const receiptId =
        existing[0].receiptId ??
        (await ensureSupplyRouteReceipt(tx, {
          supplyRouteId: data.supplyRouteId,
          supplierId,
          sourceEntryId: data.entryId,
          receiptDate: existing[0].supplyRoute.departureDate,
          foreignCurrency: snapshot.foreignCurrency as 'RMB' | 'USD' | 'UGX',
          exchangeRateForeignToUsd: foreignRate,
          exchangeRateUsdToUgx: usdRate,
        }))
      if (existing[0].receiptId && existing[0].supplierId !== supplierId) {
        await tx
          .update(supplyRouteReceipts)
          .set({ supplierId })
          .where(eq(supplyRouteReceipts.id, existing[0].receiptId))
      }
      await tx
        .delete(supplyRouteLines)
        .where(
          and(
            eq(supplyRouteLines.supplyRouteId, data.supplyRouteId),
            eq(supplyRouteLines.entryId, data.entryId),
          ),
        )
      return tx
        .insert(supplyRouteLines)
        .values(rows.map((row) => ({ ...row, receiptId })))
        .returning()
    })
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
    if (line.supplyRoute.status !== 'open')
      throw new Error('Only open routes can be edited')
    const group = await db.query.supplyRouteLines.findMany({
      where: and(
        eq(supplyRouteLines.supplyRouteId, line.supplyRouteId),
        eq(supplyRouteLines.entryId, line.entryId),
      ),
      columns: { id: true },
    })
    const received = await db.query.storeReceivings.findFirst({
      where: inArray(
        storeReceivings.supplyRouteLineId,
        group.map((member) => member.id),
      ),
    })
    if (received) throw new Error('Received entries cannot be deleted')
    await db
      .delete(supplyRouteLines)
      .where(
        and(
          eq(supplyRouteLines.supplyRouteId, line.supplyRouteId),
          eq(supplyRouteLines.entryId, line.entryId),
        ),
      )
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
      if (line.supplyRoute.status !== 'open')
        throw new Error('Only open routes can be edited')
      const group = await tx.query.supplyRouteLines.findMany({
        where: and(
          eq(supplyRouteLines.supplyRouteId, line.supplyRouteId),
          eq(supplyRouteLines.entryId, line.entryId),
        ),
        columns: { id: true },
      })
      const received = await tx.query.storeReceivings.findFirst({
        where: inArray(
          storeReceivings.supplyRouteLineId,
          group.map((member) => member.id),
        ),
      })
      if (received) throw new Error('Received entries cannot be edited')
      const amounts = calculateSupplyLineAmounts({
        quantity: data.quantity,
        unitPriceForeign: line.unitPriceForeign,
        foreignCurrency: line.foreignCurrency,
        exchangeRateForeignToUsd: line.exchangeRateForeignToUsd,
        exchangeRateUsdToUgx: line.exchangeRateUsdToUgx,
      })
      return tx
        .update(supplyRouteLines)
        .set({
          quantity: data.quantity,
          ...amounts,
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
      where: and(ilike(items.name, like), isNull(items.deletedAt)),
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
        with: { supplyRoute: true },
      })
      if (!original) throw new Error('Supply route item not found')
      if (original.supplyRoute.status !== 'open')
        throw new Error('Only open routes can be edited')
      const group = await tx.query.supplyRouteLines.findMany({
        where: and(
          eq(supplyRouteLines.supplyRouteId, original.supplyRouteId),
          eq(supplyRouteLines.entryId, original.entryId),
        ),
        columns: { id: true },
      })
      const received = await tx.query.storeReceivings.findFirst({
        where: inArray(
          storeReceivings.supplyRouteLineId,
          group.map((member) => member.id),
        ),
      })
      if (received) throw new Error('Received entries cannot be split')

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
        where: inArray(itemColors.id, referencedColorIds),
        columns: { id: true, itemId: true, colorName: true },
      })
      for (const c of referencedColors) {
        if (c.itemId !== itemIdFallback) {
          throw new Error('All colors in a split must belong to the same item')
        }
      }
      const colorNameById = Object.fromEntries(
        referencedColors.map((color) => [color.id, color.colorName]),
      )
      if (original.colorId && original.colorNameSnapshot) {
        colorNameById[original.colorId] = original.colorNameSnapshot
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
          supplierNameSnapshot: original.supplierNameSnapshot,
          articleNumberSnapshot: original.articleNumberSnapshot,
          itemNameSnapshot: original.itemNameSnapshot,
          colorNameById,
          entryId: original.entryId,
        },
        itemIdFallback,
        data.cells,
      )
      const receiptId =
        original.receiptId ??
        (await ensureSupplyRouteReceipt(tx, {
          supplyRouteId: original.supplyRouteId,
          supplierId: original.supplierId,
          sourceEntryId: original.entryId,
          receiptDate: original.supplyRoute.departureDate,
          foreignCurrency: original.foreignCurrency as 'RMB' | 'USD' | 'UGX',
          exchangeRateForeignToUsd: original.exchangeRateForeignToUsd,
          exchangeRateUsdToUgx: original.exchangeRateUsdToUgx,
        }))

      await tx
        .delete(supplyRouteLines)
        .where(eq(supplyRouteLines.id, data.itemId))
      return tx
        .insert(supplyRouteLines)
        .values(rows.map((row) => ({ ...row, receiptId })))
        .returning()
    })
  })
