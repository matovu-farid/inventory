import { createServerFn } from '@tanstack/react-start'
import { eq, sql, inArray, and, gt } from 'drizzle-orm'
import { z } from 'zod'
import { db } from '#/db'
import { variants, storeStock, shopStock } from '#/db/schema'
import { requireSession } from '#/server/middleware/auth'
import { requireRole } from '#/server/middleware/rbac'

/**
 * Per-variant rollup used by the item-detail "Variants" subsection.
 * For each variant on the given item, returns the total stock on hand
 * (across every store + shop) plus the number of distinct locations
 * where the variant currently has quantity > 0.
 *
 * The aggregation runs in the database — pulling every stock row to the
 * application layer would be wasteful when the page only needs a count.
 */
export const countVariantStockLocations = createServerFn()
  .inputValidator(z.object({ itemId: z.uuid() }))
  .handler(async ({ data }) => {
    const session = await requireSession()
    requireRole(session, ['admin', 'supervisor', 'sales'])

    const variantRows = await db
      .select({ id: variants.id })
      .from(variants)
      .where(eq(variants.itemId, data.itemId))
    if (variantRows.length === 0) return []

    const variantIds = variantRows.map((v) => v.id)

    const storeCounts = await db
      .select({
        variantId: storeStock.variantId,
        qty: sql<number>`COALESCE(SUM(${storeStock.quantityOnHand}), 0)::int`,
        locations: sql<number>`COUNT(*) FILTER (WHERE ${storeStock.quantityOnHand} > 0)::int`,
      })
      .from(storeStock)
      .where(
        and(
          inArray(storeStock.variantId, variantIds),
          gt(storeStock.quantityOnHand, 0),
        ),
      )
      .groupBy(storeStock.variantId)

    const shopCounts = await db
      .select({
        variantId: shopStock.variantId,
        qty: sql<number>`COALESCE(SUM(${shopStock.quantityOnHand}), 0)::int`,
        locations: sql<number>`COUNT(*) FILTER (WHERE ${shopStock.quantityOnHand} > 0)::int`,
      })
      .from(shopStock)
      .where(
        and(
          inArray(shopStock.variantId, variantIds),
          gt(shopStock.quantityOnHand, 0),
        ),
      )
      .groupBy(shopStock.variantId)

    const totals = new Map<string, { qty: number; locations: number }>()
    for (const id of variantIds) totals.set(id, { qty: 0, locations: 0 })
    const addTo = (variantId: string, qty: number, locations: number) => {
      const entry = totals.get(variantId)
      if (!entry) return
      entry.qty += qty
      entry.locations += locations
    }
    // Unresolved (variant_id NULL) store stock isn't keyed by variant, so
    // it doesn't contribute to a per-variant rollup. Skip those rows.
    for (const r of storeCounts) {
      if (r.variantId) addTo(r.variantId, r.qty, r.locations)
    }
    for (const r of shopCounts) addTo(r.variantId, r.qty, r.locations)
    return variantIds.map((id) => {
      const entry = totals.get(id) ?? { qty: 0, locations: 0 }
      return {
        variantId: id,
        qty: entry.qty,
        locations: entry.locations,
      }
    })
  })
