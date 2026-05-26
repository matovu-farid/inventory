import type { db as defaultDb } from '#/db'
import {
  storeReceivings,
  supplyRouteLines,
  storeTransfers,
  storeTransferLines,
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
   * Variant the baseline is computed for. Supply-route tables still carry
   * `(color_id, size)` (renamed from `(product_color_id, size)` in #6);
   * stock tables key on `variant_id` directly (#4). Joins resolve both
   * shapes via the variants table.
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
      supplyRouteLines,
      eq(storeReceivings.supplyRouteLineId, supplyRouteLines.id),
    )
    .innerJoin(
      variants,
      and(
        eq(variants.colorId, supplyRouteLines.colorId),
        eq(variants.size, supplyRouteLines.size),
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
      qty: sql<number>`COALESCE(${storeTransferLines.quantityReceived}, ${storeTransferLines.quantityDispatched})`,
    })
    .from(storeTransferLines)
    .innerJoin(
      storeTransfers,
      eq(storeTransferLines.storeTransferId, storeTransfers.id),
    )
    .innerJoin(storeStock, eq(storeTransferLines.storeStockId, storeStock.id))
    .innerJoin(variants, eq(variants.id, storeStock.variantId))
    .where(
      and(
        eq(storeTransfers.shopId, args.shopId),
        eq(variants.id, args.variantId),
      ),
    )
    .orderBy(desc(storeTransferLines.createdAt))
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
