import { createServerFn } from "@tanstack/react-start"
import { z } from "zod"
import { sql } from "drizzle-orm"
import { db } from "#/db"
import { shops, shopSales, shopStock } from "#/db/schema"
import {
  deriveShopSalesPrereqs,
  deriveShopOpeningPrereqs,
  deriveShopPrereqs,
} from "#/lib/prerequisites/derive"

export const getShopSalesPrereqs = createServerFn().handler(async () => {
  const [shopRow, saleRow] = await Promise.all([
    db.select({ count: sql<number>`count(*)::int` }).from(shops),
    db.select({ count: sql<number>`count(*)::int` }).from(shopSales),
  ])
  return deriveShopSalesPrereqs({
    shopCount: shopRow[0]?.count ?? 0,
    totalSaleCount: saleRow[0]?.count ?? 0,
  })
})

export const getShopOpeningBalancePrereqs = createServerFn().handler(
  async () => {
    const shopRow = await db
      .select({ count: sql<number>`count(*)::int` })
      .from(shops)
    return deriveShopOpeningPrereqs({ shopCount: shopRow[0]?.count ?? 0 })
  },
)

const shopPrereqInput = z.object({
  /** When null/empty, no shop is selected and prereqs are SATISFIED. */
  shopId: z.string().uuid().nullable().optional(),
})

export const getShopPrereqs = createServerFn()
  .inputValidator(shopPrereqInput)
  .handler(async ({ data }) => {
    if (!data.shopId) {
      return deriveShopPrereqs({ selectedShopHasStock: null })
    }
    const stockRow = await db
      .select({ count: sql<number>`count(*)::int` })
      .from(shopStock)
      .where(
        sql`${shopStock.shopId} = ${data.shopId} AND ${shopStock.quantityOnHand} > 0`,
      )
    const hasStock = (stockRow[0]?.count ?? 0) > 0
    return deriveShopPrereqs({ selectedShopHasStock: hasStock })
  })
