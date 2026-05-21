import { db as defaultDb } from "#/db"
import {
  storeReceivings,
  supplyRouteItems,
  storeTransfers,
  storeTransferItems,
  storeStock,
} from "#/db/schema"
import { and, desc, eq, sql } from "drizzle-orm"

export interface BaselineResult {
  baseline: number | null
  sampleCount: 0 | 1 | 2 | 3
}

interface VariantKey {
  productColorId: string
  size: string
}

type Db = typeof defaultDb

export async function computeStoreBaseline(
  db: Db,
  args: { storeId: string } & VariantKey,
): Promise<BaselineResult> {
  const rows = await db
    .select({ qty: storeReceivings.quantityReceived })
    .from(storeReceivings)
    .innerJoin(
      supplyRouteItems,
      eq(storeReceivings.supplyRouteItemId, supplyRouteItems.id),
    )
    .where(
      and(
        eq(storeReceivings.storeId, args.storeId),
        eq(supplyRouteItems.productColorId, args.productColorId),
        eq(supplyRouteItems.size, args.size),
      ),
    )
    .orderBy(desc(storeReceivings.receivedDate))
    .limit(3)

  return averageBaseline(rows.map((r) => r.qty))
}

export async function computeShopBaseline(
  db: Db,
  args: { shopId: string } & VariantKey,
): Promise<BaselineResult> {
  const rows = await db
    .select({
      qty: sql<number>`COALESCE(${storeTransferItems.quantityReceived}, ${storeTransferItems.quantityDispatched})`,
    })
    .from(storeTransferItems)
    .innerJoin(
      storeTransfers,
      eq(storeTransferItems.storeTransferId, storeTransfers.id),
    )
    .innerJoin(storeStock, eq(storeTransferItems.storeStockId, storeStock.id))
    .where(
      and(
        eq(storeTransfers.shopId, args.shopId),
        eq(storeStock.productColorId, args.productColorId),
        eq(storeStock.size, args.size),
      ),
    )
    .orderBy(desc(storeTransferItems.createdAt))
    .limit(3)

  return averageBaseline(rows.map((r) => Number(r.qty)))
}

function averageBaseline(samples: number[]): BaselineResult {
  if (samples.length === 0) return { baseline: null, sampleCount: 0 }
  const sum = samples.reduce((a, b) => a + b, 0)
  return {
    baseline: sum / samples.length,
    sampleCount: samples.length as 1 | 2 | 3,
  }
}
