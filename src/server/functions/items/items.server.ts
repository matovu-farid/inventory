// Server-only module: exports query helpers + Zod schemas for the items
// table. Split out from items.ts because that file is imported by
// client-reachable routes (src/routes/items/*); TanStack Start's
// import-protection plugin denies any client-reachable module that
// imports `#/db` at module scope. The `.server.ts` suffix is TanStack's
// canonical marker for a server-only module — the client bundle excludes
// it entirely. See:
// https://tanstack.com/start/latest/docs/framework/react/guide/import-protection
//
// Consumers:
//   - src/server/functions/items/items.ts (createServerFn wrappers)
//   - other vitest tests that need to exercise data semantics directly

import {
  and,
  asc,
  eq,
  exists,
  gte,
  ilike,
  inArray,
  isNull,
  lte,
  not,
  or,
  sql,
} from 'drizzle-orm'
import { z } from 'zod'
import { db } from '#/db'
import type { DbOrTx } from '#/db'
import { normalizeArticleNumber } from '#/lib/items/article-number'
import {
  itemArticleNumbers,
  items,
  itemColors,
  lowStockAlerts,
  notificationThresholdOverrides,
  restockRequisitions,
  shopReturnLines,
  shopSaleLines,
  shopStock,
  stockTakeLines,
  storeReturnLines,
  storeStock,
  storeTransferLines,
  supplyRouteLines,
  supplyRoutes,
  variants,
  itemImages,
} from '#/db/schema'
import { materializeVariantsFromColorsSizes } from './variants-materialize'

const colorInput = z.object({
  colorName: z.string().min(1).max(40),
  colorHex: z.string().regex(/^#[0-9a-fA-F]{6}$/),
})

export const returnDateFilter = z
  .object({
    returnDateFrom: z.iso.date().optional(),
    returnDateTo: z.iso.date().optional(),
  })
  .refine(
    (value) =>
      !value.returnDateFrom ||
      !value.returnDateTo ||
      value.returnDateFrom <= value.returnDateTo,
    {
      message: 'Return date from must be on or before return date to',
      path: ['returnDateTo'],
    },
  )

export type ReturnDateFilter = z.infer<typeof returnDateFilter>

function parseReturnDateFilter(input?: ReturnDateFilter): ReturnDateFilter {
  return returnDateFilter.parse(input ?? {})
}

function returnDateCondition(filter: ReturnDateFilter) {
  if (!filter.returnDateFrom && !filter.returnDateTo) return undefined

  return exists(
    db
      .select({ id: supplyRouteLines.id })
      .from(supplyRouteLines)
      .innerJoin(
        supplyRoutes,
        eq(supplyRouteLines.supplyRouteId, supplyRoutes.id),
      )
      .where(
        and(
          eq(supplyRouteLines.itemId, items.id),
          filter.returnDateFrom
            ? gte(supplyRoutes.returnDate, filter.returnDateFrom)
            : undefined,
          filter.returnDateTo
            ? lte(supplyRoutes.returnDate, filter.returnDateTo)
            : undefined,
        ),
      ),
  )
}

export const upsertInput = z.object({
  name: z.string().trim().min(1).max(120),
  design: z.string().trim().min(1).max(64),
  articleNumbers: z.array(z.string().trim().min(1).max(64)).min(1),
  description: z.string().max(1000).optional(),
  supplierId: z.uuid().optional(),
  costPrice: z
    .string()
    .regex(/^\d+(\.\d{1,2})?$/)
    .optional(),
  costCurrency: z.enum(['RMB', 'USD', 'UGX']).optional(),
  // Sizes are no longer persisted on items (issue #7 drops items.sizes).
  // The caller still passes them on create so the server can materialize
  // the (colors × sizes) cross product into the variants table.
  sizes: z.array(z.string().min(1).max(16)).default([]),
  colors: z.array(colorInput).default([]),
  /**
   * Variant-flexibility Plan 1, Task 4: item-level floor price and
   * low-stock threshold. Both optional on input; the create handler
   * defaults them to "0" and null respectively (matching the column
   * defaults / nullability in items schema).
   */
  minimumSellPriceUgx: z
    .string()
    .regex(/^\d+(\.\d{1,2})?$/)
    .refine((v) => Number(v) > 0, 'Minimum sell price must be positive')
    .optional(),
  lowStockThreshold: z.number().int().min(0).nullable().optional(),
})

export const updateInput = upsertInput
  .extend({ id: z.uuid() })
  // On update, sizes/colors are managed independently through the
  // variant + color endpoints; ignore them here so callers don't have
  // to send the full payload. Article numbers are managed independently.
  .partial({
    name: true,
    sizes: true,
    colors: true,
    design: true,
    articleNumbers: true,
    supplierId: true,
    costPrice: true,
    costCurrency: true,
    minimumSellPriceUgx: true,
    lowStockThreshold: true,
  })

// Item-detail queries hydrate the variants list so UI flows that pick a
// (color, size) cell — opening balance, supply route editor — can map that
// pair back to a `variantId` client-side.
const ITEM_DETAIL_WITH = {
  supplier: { columns: { id: true, name: true } },
  articleNumbers: {
    columns: { id: true, articleNumber: true },
  },
  colors: {
    columns: {
      id: true,
      colorName: true,
      colorHex: true,
      imageS3Key: true,
    },
  },
  images: {
    orderBy: sql`${itemImages.sortOrder} asc, ${itemImages.createdAt} asc`,
  },
  variants: {
    columns: { id: true, colorId: true, size: true },
  },
} as const

// ─── Pure query helpers ──────────────────────────────────────────────────────
// Exported separately from the createServerFn wrappers so that vitest can
// exercise the data semantics directly. TanStack's server-fn wrapper
// swallows return values when called outside SSR, so tests assert against
// the pure helpers; route + Cypress coverage exercises the wrapper layer.

export async function listItemsQuery(
  input?: { includeArchived?: boolean } & ReturnDateFilter,
) {
  const dateFilter = parseReturnDateFilter(input)
  return db.query.items.findMany({
    where: and(
      input?.includeArchived ? undefined : isNull(items.deletedAt),
      returnDateCondition(dateFilter),
    ),
    with: ITEM_DETAIL_WITH,
    orderBy: (p) => [asc(p.name), asc(p.id)],
  })
}

export async function getItemByArticleQuery(input: {
  articleNumber: string
  includeArchived?: boolean
}) {
  const articleNumber = normalizeArticleNumber(input.articleNumber)
  return db.query.items.findFirst({
    where: and(
      input.includeArchived ? undefined : isNull(items.deletedAt),
      exists(
        db
          .select({ id: itemArticleNumbers.id })
          .from(itemArticleNumbers)
          .where(
            and(
              eq(itemArticleNumbers.itemId, items.id),
              eq(itemArticleNumbers.articleNumber, articleNumber),
            ),
          ),
      ),
    ),
    with: ITEM_DETAIL_WITH,
  })
}

export async function searchItemsQuery(
  input: {
    query: string
    includeArchived?: boolean
  } & ReturnDateFilter,
) {
  const dateFilter = parseReturnDateFilter(input)
  const activeFilter = input.includeArchived
    ? undefined
    : isNull(items.deletedAt)
  const routeReturnDateFilter = returnDateCondition(dateFilter)
  if (!input.query.trim()) {
    return db.query.items.findMany({
      where: and(activeFilter, routeReturnDateFilter),
      with: ITEM_DETAIL_WITH,
      limit: 20,
      orderBy: (p) => [asc(p.name), asc(p.id)],
    })
  }
  const like = `%${input.query.trim()}%`
  return db.query.items.findMany({
    where: and(
      activeFilter,
      routeReturnDateFilter,
      or(
        ilike(items.name, like),
        exists(
          db
            .select({ id: itemArticleNumbers.id })
            .from(itemArticleNumbers)
            .where(
              and(
                eq(itemArticleNumbers.itemId, items.id),
                ilike(itemArticleNumbers.articleNumber, like),
              ),
            ),
        ),
      ),
    ),
    with: ITEM_DETAIL_WITH,
    limit: 20,
    orderBy: (p) => [asc(p.name), asc(p.id)],
  })
}

export async function archiveItemQuery(input: { id: string }) {
  const archivedRows = await db
    .update(items)
    .set({ deletedAt: new Date() })
    .where(and(eq(items.id, input.id), isNull(items.deletedAt)))
    .returning()
  if (archivedRows.length === 0) throw new Error('Item not found')
  return archivedRows[0]
}

export async function restoreItemQuery(input: { id: string }) {
  const restoredRows = await db
    .update(items)
    .set({ deletedAt: null })
    .where(eq(items.id, input.id))
    .returning()
  if (restoredRows.length === 0) throw new Error('Item not found')
  return restoredRows[0]
}

/**
 * Permanently deletes an item only when it has no historical or inventory
 * references. Referenced items must be archived so audit history remains
 * intact. Variants and colors are intentionally left to their FK cascades.
 */
export async function deleteItemQuery(input: { id: string }) {
  const referenceRows = await Promise.all([
    db
      .select({ id: supplyRouteLines.id })
      .from(supplyRouteLines)
      .where(eq(supplyRouteLines.itemId, input.id))
      .limit(1),
    db
      .select({ id: storeStock.id })
      .from(storeStock)
      .where(eq(storeStock.itemId, input.id))
      .limit(1),
    db
      .select({ id: shopStock.id })
      .from(shopStock)
      .where(eq(shopStock.itemId, input.id))
      .limit(1),
    db
      .select({ id: storeTransferLines.id })
      .from(storeTransferLines)
      .where(eq(storeTransferLines.itemId, input.id))
      .limit(1),
    db
      .select({ id: shopSaleLines.id })
      .from(shopSaleLines)
      .where(eq(shopSaleLines.itemId, input.id))
      .limit(1),
    db
      .select({ id: shopReturnLines.id })
      .from(shopReturnLines)
      .where(eq(shopReturnLines.itemId, input.id))
      .limit(1),
    db
      .select({ id: storeReturnLines.id })
      .from(storeReturnLines)
      .where(eq(storeReturnLines.itemId, input.id))
      .limit(1),
    db
      .select({ id: stockTakeLines.id })
      .from(stockTakeLines)
      .where(eq(stockTakeLines.itemId, input.id))
      .limit(1),
    db
      .select({ id: notificationThresholdOverrides.id })
      .from(notificationThresholdOverrides)
      .where(eq(notificationThresholdOverrides.itemId, input.id))
      .limit(1),
    db
      .select({ id: lowStockAlerts.id })
      .from(lowStockAlerts)
      .where(eq(lowStockAlerts.itemId, input.id))
      .limit(1),
    db
      .select({ id: restockRequisitions.id })
      .from(restockRequisitions)
      .where(eq(restockRequisitions.itemId, input.id))
      .limit(1),
  ])

  if (referenceRows.some((rows) => rows.length > 0)) {
    throw new Error(
      'Item has historical or inventory references. Archive it instead of deleting it permanently.',
    )
  }

  const deletedRows = await db
    .delete(items)
    .where(eq(items.id, input.id))
    .returning({ id: items.id })
  if (deletedRows.length === 0) throw new Error('Item not found')
  return deletedRows[0]
}

export async function createItemQuery(data: z.infer<typeof upsertInput>) {
  if (
    !data.supplierId ||
    !data.costPrice ||
    !data.costCurrency ||
    !data.minimumSellPriceUgx ||
    Number(data.costPrice) <= 0 ||
    Number(data.minimumSellPriceUgx) <= 0
  ) {
    throw new Error(
      'Supplier, supplier cost, cost currency, and a positive minimum sell price are required',
    )
  }
  const articleNumbers = normalizeArticleNumbers(data.articleNumbers)
  try {
    return await db.transaction(async (tx) => {
      await assertArticleNumbersAvailable(tx, articleNumbers)
      const [row] = await tx
        .insert(items)
        .values({
          name: data.name,
          description: data.description,
          design: data.design,
          supplierId: data.supplierId,
          costPrice: data.costPrice,
          costCurrency: data.costCurrency,
          minimumSellPriceUgx: data.minimumSellPriceUgx,
          lowStockThreshold: data.lowStockThreshold ?? null,
        })
        .returning()

      await tx.insert(itemArticleNumbers).values(
        articleNumbers.map((articleNumber) => ({
          itemId: row.id,
          articleNumber,
        })),
      )

      if (data.colors.length > 0) {
        const insertedColors = await tx
          .insert(itemColors)
          .values(
            data.colors.map((c) => ({
              itemId: row.id,
              colorName: c.colorName,
              colorHex: c.colorHex,
            })),
          )
          .returning()
        if (data.sizes.length > 0) {
          await materializeVariantsFromColorsSizes(
            {
              itemId: row.id,
              colorIds: insertedColors.map((c) => c.id),
              sizes: data.sizes,
            },
            tx,
          )
        }
      }
      const created = await tx.query.items.findFirst({
        where: eq(items.id, row.id),
        with: ITEM_DETAIL_WITH,
      })
      if (!created) throw new Error('Failed to load created item')
      return created
    })
  } catch (error) {
    if (isUniqueViolation(error)) {
      throw new Error('Article number already belongs to another item')
    }
    throw error
  }
}

export async function updateItemQuery(data: z.infer<typeof updateInput>) {
  const {
    id,
    design,
    articleNumbers: _articleNumbers,
    sizes: _sizes,
    colors: _colors,
    minimumSellPriceUgx,
    lowStockThreshold,
    ...fields
  } = data
  void _articleNumbers
  void _sizes
  void _colors
  const patch = {
    ...(fields.name === undefined ? {} : { name: fields.name }),
    ...(fields.description === undefined
      ? {}
      : { description: fields.description }),
    ...(design === undefined ? {} : { design }),
    ...(fields.supplierId === undefined
      ? {}
      : { supplierId: fields.supplierId }),
    ...(fields.costPrice === undefined ? {} : { costPrice: fields.costPrice }),
    ...(fields.costCurrency === undefined
      ? {}
      : { costCurrency: fields.costCurrency }),
    // Treat undefined as "no change"; null clears the threshold.
    // Using `=== undefined` (not `"key" in data`) so a caller that
    // explicitly passes the key with `undefined` is still a no-op,
    // matching the symmetric treatment of minimumSellPriceUgx.
    ...(minimumSellPriceUgx === undefined ? {} : { minimumSellPriceUgx }),
    ...(lowStockThreshold === undefined ? {} : { lowStockThreshold }),
  }
  const rows = await db
    .update(items)
    .set(patch)
    .where(and(eq(items.id, id), isNull(items.deletedAt)))
    .returning()
  if (rows.length === 0) throw new Error('Item not found')
  return rows[0]
}

function normalizeArticleNumbers(values: readonly string[]): string[] {
  const normalized = values.map(normalizeArticleNumber)
  if (new Set(normalized).size !== normalized.length) {
    throw new Error('Article numbers must be unique')
  }
  return normalized
}

function isUniqueViolation(error: unknown): boolean {
  let current: unknown = error
  for (let depth = 0; depth < 3; depth += 1) {
    if (
      current &&
      typeof current === 'object' &&
      'code' in current &&
      (current as { code?: unknown }).code === '23505'
    ) {
      return true
    }
    current =
      current && typeof current === 'object' && 'cause' in current
        ? (current as { cause?: unknown }).cause
        : undefined
  }
  return false
}

async function lockActiveItem(executor: DbOrTx, itemId: string) {
  const rows = await executor
    .select({ id: items.id })
    .from(items)
    .where(and(eq(items.id, itemId), isNull(items.deletedAt)))
    .for('update')
  if (rows.length === 0) throw new Error('Item not found')
  return rows[0]
}

async function assertArticleNumbersAvailable(
  executor: DbOrTx,
  articleNumbers: readonly string[],
  itemId?: string,
) {
  const conflicts = await executor
    .select({ itemId: itemArticleNumbers.itemId })
    .from(itemArticleNumbers)
    .where(
      and(
        inArray(itemArticleNumbers.articleNumber, articleNumbers),
        itemId ? not(eq(itemArticleNumbers.itemId, itemId)) : undefined,
      ),
    )
  if (conflicts.length > 0) {
    throw new Error('Article number already belongs to another item')
  }
}

export async function addItemArticleNumberQuery(input: {
  itemId: string
  articleNumber: string
}) {
  const articleNumber = normalizeArticleNumber(input.articleNumber)
  try {
    return await db.transaction(async (tx) => {
      await lockActiveItem(tx, input.itemId)
      await assertArticleNumbersAvailable(tx, [articleNumber], input.itemId)
      const [row] = await tx
        .insert(itemArticleNumbers)
        .values({ itemId: input.itemId, articleNumber })
        .returning()
      return row
    })
  } catch (error) {
    if (isUniqueViolation(error)) {
      throw new Error('Article number already belongs to another item')
    }
    throw error
  }
}

export async function removeItemArticleNumberQuery(input: {
  itemId: string
  articleNumberId: string
}) {
  return db.transaction(async (tx) => {
    await lockActiveItem(tx, input.itemId)
    const rows = await tx
      .select({ id: itemArticleNumbers.id })
      .from(itemArticleNumbers)
      .where(eq(itemArticleNumbers.itemId, input.itemId))
    if (rows.length <= 1) {
      throw new Error('An item must have at least one article number')
    }
    const deleted = await tx
      .delete(itemArticleNumbers)
      .where(
        and(
          eq(itemArticleNumbers.id, input.articleNumberId),
          eq(itemArticleNumbers.itemId, input.itemId),
        ),
      )
      .returning({ id: itemArticleNumbers.id })
    if (deleted.length === 0) throw new Error('Article number not found')
    return deleted[0]
  })
}

export async function replaceItemArticleNumbersQuery(input: {
  itemId: string
  articleNumbers: string[]
}) {
  const articleNumbers = normalizeArticleNumbers(input.articleNumbers)
  try {
    return await db.transaction(async (tx) => {
      await lockActiveItem(tx, input.itemId)
      await assertArticleNumbersAvailable(tx, articleNumbers, input.itemId)
      await tx
        .delete(itemArticleNumbers)
        .where(eq(itemArticleNumbers.itemId, input.itemId))
      await tx.insert(itemArticleNumbers).values(
        articleNumbers.map((articleNumber) => ({
          itemId: input.itemId,
          articleNumber,
        })),
      )
      return tx
        .select()
        .from(itemArticleNumbers)
        .where(eq(itemArticleNumbers.itemId, input.itemId))
        .orderBy(asc(itemArticleNumbers.articleNumber))
    })
  } catch (error) {
    if (isUniqueViolation(error)) {
      throw new Error('Article number already belongs to another item')
    }
    throw error
  }
}

/**
 * Lists the sizes currently materialized for an item by reading the
 * variants table. Returns the unique set of sizes (preserves the
 * insertion order); the UI sorts via deriveSizes() for display.
 */
export async function listItemSizesQuery(input: { itemId: string }) {
  const rows = await db
    .select({ size: variants.size })
    .from(variants)
    .where(eq(variants.itemId, input.itemId))
  const seen = new Set<string>()
  for (const r of rows) seen.add(r.size)
  return [...seen]
}
