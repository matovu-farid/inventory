import { createServerFn } from "@tanstack/react-start"
import { and, eq } from "drizzle-orm"
import { z } from "zod"
import { db } from "#/db"
import {
  lowStockAlerts,
  shopStock,
  itemColors,
  items,
  storeStock,
  variants,
} from "#/db/schema"
import { requireSession } from "#/server/middleware/auth"
import { requireRole } from "#/server/middleware/rbac"
import { formatProductLabel } from "#/lib/products"

const input = z.object({ shopId: z.uuid() })

export const listShopRestockSuggestions = createServerFn()
  .inputValidator(input)
  .handler(async ({ data }) => {
    const session = await requireSession()
    requireRole(session, ["admin", "supervisor"])

    // Join open alerts for this shop with the live shop_stock row and the
    // matching store_stock row (for restock source — same variant in
    // warehouse). The alerts table still keys on (product_color_id, size)
    // — that swap is owned by issue #5 — so this query bridges via the
    // `variants` table: alert.product_color_id+size ↔ variant.color_id+size
    // ↔ shop_stock.variant_id / store_stock.variant_id.
    const rows = await db
      .select({
        alertId: lowStockAlerts.id,
        shopStockId: shopStock.id,
        productColorId: lowStockAlerts.productColorId,
        size: lowStockAlerts.size,
        quantityOnHand: shopStock.quantityOnHand,
        baseline: lowStockAlerts.baselineQuantity,
        storeStockId: storeStock.id,
        storeQuantity: storeStock.quantityOnHand,
        articleNumber: items.articleNumber,
        colorName: itemColors.colorName,
      })
      .from(lowStockAlerts)
      .innerJoin(
        variants,
        and(
          eq(variants.colorId, lowStockAlerts.productColorId),
          eq(variants.size, lowStockAlerts.size),
        ),
      )
      .innerJoin(
        shopStock,
        and(
          eq(shopStock.shopId, lowStockAlerts.locationId),
          eq(shopStock.variantId, variants.id),
        ),
      )
      .innerJoin(itemColors, eq(itemColors.id, variants.colorId))
      .innerJoin(items, eq(items.id, itemColors.itemId))
      .leftJoin(storeStock, eq(storeStock.variantId, variants.id))
      .where(
        and(
          eq(lowStockAlerts.scope, "shop"),
          eq(lowStockAlerts.locationId, data.shopId),
          eq(lowStockAlerts.status, "open"),
        ),
      )

    return rows.map((r) => ({
      alertId: r.alertId,
      shopStockId: r.shopStockId,
      productColorId: r.productColorId,
      size: r.size,
      quantityOnHand: r.quantityOnHand,
      baseline: r.baseline,
      suggestedQuantity: Math.max(0, r.baseline - r.quantityOnHand),
      storeStockId: r.storeStockId,
      storeQuantity: r.storeQuantity ?? 0,
      productLabel: formatProductLabel(
        r.articleNumber,
        r.colorName,
        r.size,
      ),
    }))
  })
