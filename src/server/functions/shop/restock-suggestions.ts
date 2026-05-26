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
    // matching store_stock row (for restock source — same variant in warehouse).
    const rows = await db
      .select({
        alertId: lowStockAlerts.id,
        shopStockId: shopStock.id,
        productColorId: shopStock.productColorId,
        size: shopStock.size,
        quantityOnHand: shopStock.quantityOnHand,
        baseline: lowStockAlerts.baselineQuantity,
        storeStockId: storeStock.id,
        storeQuantity: storeStock.quantityOnHand,
        articleNumber: items.articleNumber,
        colorName: itemColors.colorName,
      })
      .from(lowStockAlerts)
      .innerJoin(
        shopStock,
        and(
          eq(shopStock.shopId, lowStockAlerts.locationId),
          eq(shopStock.productColorId, lowStockAlerts.productColorId),
          eq(shopStock.size, lowStockAlerts.size),
        ),
      )
      .innerJoin(itemColors, eq(itemColors.id, shopStock.productColorId))
      .innerJoin(items, eq(items.id, itemColors.itemId))
      .leftJoin(
        storeStock,
        and(
          eq(storeStock.productColorId, shopStock.productColorId),
          eq(storeStock.size, shopStock.size),
        ),
      )
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
