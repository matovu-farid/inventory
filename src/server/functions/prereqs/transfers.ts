import { createServerFn } from "@tanstack/react-start"
import { sql } from "drizzle-orm"
import { db } from "#/db"
import { shops, storeStock } from "#/db/schema"
import { deriveTransfersPrereqs } from "#/lib/prerequisites/derive"

export const getTransfersPrereqs = createServerFn().handler(async () => {
  const [shopRow, stockRow] = await Promise.all([
    db.select({ count: sql<number>`count(*)::int` }).from(shops),
    db
      .select({ count: sql<number>`count(*)::int` })
      .from(storeStock)
      .where(sql`${storeStock.quantityOnHand} > 0`),
  ])
  return deriveTransfersPrereqs({
    shopCount: shopRow[0]?.count ?? 0,
    stockRowsWithQty: stockRow[0]?.count ?? 0,
  })
})
