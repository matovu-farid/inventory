import { createServerFn } from "@tanstack/react-start"
import { sql } from "drizzle-orm"
import { db } from "#/db"
import { storeStock } from "#/db/schema"
import { deriveStorePrereqs } from "#/lib/prerequisites/derive"

export const getStorePrereqs = createServerFn().handler(async () => {
  const row = await db
    .select({ count: sql<number>`count(*)::int` })
    .from(storeStock)
    .where(sql`${storeStock.quantityOnHand} > 0`)
  return deriveStorePrereqs({ stockRowCount: row[0]?.count ?? 0 })
})
