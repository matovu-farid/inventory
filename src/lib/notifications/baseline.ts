import type { db as defaultDb } from "#/db"
import {
  storeReceivings,
  supplyRouteItems,
  storeTransfers,
  storeTransferItems,
  storeStock,
  variants,
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
  // store_stock now keys on variant_id (issue #4). The notification
  // domain (alert keys, baseline lookups, threshold overrides) still
  // operates on (product_color_id, size) until issue #5 lands, so we
  // bridge by joining store_stock → variants and filtering on the
  // variant's (color_id, size).
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
    .innerJoin(variants, eq(variants.id, storeStock.variantId))
    .where(
      and(
        eq(storeTransfers.shopId, args.shopId),
        eq(variants.colorId, args.productColorId),
        eq(variants.size, args.size),
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
