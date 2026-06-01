import { createServerFn } from '@tanstack/react-start'
import { and, eq } from 'drizzle-orm'
import { z } from 'zod'
import { db } from '#/db'
import {
  lowStockAlerts,
  shopStock,
  itemColors,
  items,
  storeStock,
  variants,
} from '#/db/schema'
import { requireSession } from '#/server/middleware/auth'
import { requireRole } from '#/server/middleware/rbac'
import { formatItemLabel } from '#/lib/items'

const input = z.object({ shopId: z.uuid() })

export const listShopRestockSuggestions = createServerFn()
  .inputValidator(input)
  .handler(async ({ data }) => {
    const session = await requireSession()
    requireRole(session, ['admin', 'supervisor'])

    // Join open alerts (variant-keyed per #5) with the live shop_stock row
    // and the matching store_stock row (same variant in warehouse) so the
    // restock UI can show "currently in shop / in store" side-by-side.
    const rows = await db
      .select({
        alertId: lowStockAlerts.id,
        shopStockId: shopStock.id,
        itemId: items.id,
        variantId: variants.id,
        size: variants.size,
        quantityOnHand: shopStock.quantityOnHand,
        baseline: lowStockAlerts.baselineQuantity,
        storeStockId: storeStock.id,
        storeQuantity: storeStock.quantityOnHand,
        articleNumber: items.articleNumber,
        colorName: itemColors.colorName,
      })
      .from(lowStockAlerts)
      .innerJoin(variants, eq(variants.id, lowStockAlerts.variantId))
      .innerJoin(itemColors, eq(itemColors.id, variants.colorId))
      .innerJoin(items, eq(items.id, variants.itemId))
      .innerJoin(
        shopStock,
        and(
          eq(shopStock.shopId, lowStockAlerts.locationId),
          eq(shopStock.variantId, variants.id),
        ),
      )
      .leftJoin(storeStock, eq(storeStock.variantId, variants.id))
      .where(
        and(
          eq(lowStockAlerts.scope, 'shop'),
          eq(lowStockAlerts.locationId, data.shopId),
          eq(lowStockAlerts.status, 'open'),
        ),
      )

    return rows.map((r) => ({
      alertId: r.alertId,
      shopStockId: r.shopStockId,
      itemId: r.itemId,
      variantId: r.variantId,
      size: r.size,
      quantityOnHand: r.quantityOnHand,
      baseline: r.baseline,
      suggestedQuantity: Math.max(0, r.baseline - r.quantityOnHand),
      storeStockId: r.storeStockId,
      storeQuantity: r.storeQuantity ?? 0,
      itemLabel: formatItemLabel(r.articleNumber, r.colorName, r.size),
    }))
  })
