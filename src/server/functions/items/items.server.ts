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
//   - src/__tests__/list-item-categories.test.ts (vitest, server-side)
//   - other vitest tests that need to exercise data semantics directly

import {
  and,
  asc,
  eq,
  exists,
  gte,
  ilike,
  isNull,
  lte,
  or,
  sql,
} from 'drizzle-orm'
import { z } from 'zod'
import { db } from '#/db'
import {
  itemCategories,
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
  itemColorImages,
} from '#/db/schema'
import { materializeVariantsFromColorsSizes } from './variants-materialize'
import { findOrCreateItemCategoryQuery } from './categories.server'

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
  articleNumber: z.string().min(1).max(64),
  name: z.string().min(1).max(120),
  description: z.string().max(1000).optional(),
  /**
   * Free-text catalog grouping. Required on create; the combobox in
   * item-editor.tsx populates this from `listItemCategories()` or accepts
   * a brand new value typed by the user.
   */
  category: z.string().trim().min(1).max(64),
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
  // to send the full payload. Category may be patched.
  .partial({
    articleNumber: true,
    name: true,
    sizes: true,
    colors: true,
    category: true,
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
  categoryRecord: { columns: { id: true, name: true, deletedAt: true } },
  colors: {
    with: {
      images: {
        orderBy: sql`${itemColorImages.sortOrder} asc, ${itemColorImages.createdAt} asc`,
      },
    },
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
    orderBy: (p) => [asc(p.articleNumber)],
  })
}

export async function getItemByArticleQuery(input: {
  articleNumber: string
  includeArchived?: boolean
}) {
  return db.query.items.findFirst({
    where: input.includeArchived
      ? eq(items.articleNumber, input.articleNumber)
      : and(
          eq(items.articleNumber, input.articleNumber),
          isNull(items.deletedAt),
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
      orderBy: (p) => [asc(p.articleNumber)],
    })
  }
  const like = `%${input.query}%`
  return db.query.items.findMany({
    where: and(
      activeFilter,
      routeReturnDateFilter,
      or(ilike(items.articleNumber, like), ilike(items.name, like)),
    ),
    with: ITEM_DETAIL_WITH,
    limit: 20,
    orderBy: (p) => [asc(p.articleNumber)],
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

/**
 * Returns the distinct set of category values currently in use on items,
 * sorted ascending. Powers the create-item / detail-edit combobox.
 */
export async function listItemCategoriesQuery() {
  const rows = await db
    .select({ category: itemCategories.name })
    .from(itemCategories)
    .where(isNull(itemCategories.deletedAt))
    .orderBy(asc(itemCategories.name))
  return rows.map((r) => r.category)
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
  const category = await findOrCreateItemCategoryQuery({ name: data.category })
  const [row] = await db
    .insert(items)
    .values({
      articleNumber: data.articleNumber,
      name: data.name,
      description: data.description,
      category: data.category,
      categoryId: category.id,
      supplierId: data.supplierId,
      costPrice: data.costPrice,
      costCurrency: data.costCurrency,
      minimumSellPriceUgx: data.minimumSellPriceUgx,
      lowStockThreshold: data.lowStockThreshold ?? null,
    })
    .returning()

  if (data.colors.length > 0) {
    const insertedColors = await db
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
      await materializeVariantsFromColorsSizes({
        itemId: row.id,
        colorIds: insertedColors.map((c) => c.id),
        sizes: data.sizes,
      })
    }
  }
  return row
}

export async function updateItemQuery(data: z.infer<typeof updateInput>) {
  const {
    id,
    category,
    sizes: _sizes,
    colors: _colors,
    minimumSellPriceUgx,
    lowStockThreshold,
    ...fields
  } = data
  void _sizes
  void _colors
  const categoryId =
    category === undefined
      ? undefined
      : (await findOrCreateItemCategoryQuery({ name: category })).id
  const patch = {
    ...(fields.articleNumber === undefined
      ? {}
      : { articleNumber: fields.articleNumber }),
    ...(fields.name === undefined ? {} : { name: fields.name }),
    ...(fields.description === undefined
      ? {}
      : { description: fields.description }),
    ...(category === undefined ? {} : { category, categoryId }),
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
