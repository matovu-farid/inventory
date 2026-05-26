import type { db as defaultDb } from '#/db'
import {
  storeReceivings,
  supplyRouteItems,
  storeTransfers,
  storeTransferItems,
  storeStock,
  variants,
} from '#/db/schema'
import { and, desc, eq, sql } from 'drizzle-orm'

export interface BaselineResult {
  baseline: number | null
  sampleCount: 0 | 1 | 2 | 3
}

interface VariantKey {
  /**
   * Variant the baseline is computed for. Stock / supply-route tables still
   * carry `(product_color_id, size)` (rename owned by #4), so we resolve them
   * via the variants table on the way in.
   */
  variantId: string
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
    .innerJoin(
      variants,
      and(
        eq(variants.colorId, supplyRouteItems.productColorId),
        eq(variants.size, supplyRouteItems.size),
      ),
    )
    .where(
      and(
        eq(storeReceivings.storeId, args.storeId),
        eq(variants.id, args.variantId),
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
    .innerJoin(
      variants,
      and(
        eq(variants.colorId, storeStock.productColorId),
        eq(variants.size, storeStock.size),
      ),
    )
    .where(
      and(
        eq(storeTransfers.shopId, args.shopId),
        eq(variants.id, args.variantId),
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
