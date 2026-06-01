import type { db as defaultDb } from '#/db'
import {
  storeReceivings,
  supplyRouteLines,
  storeTransfers,
  storeTransferLines,
} from '#/db/schema'
import { and, desc, eq, sql } from 'drizzle-orm'

export interface BaselineResult {
  baseline: number | null
  sampleCount: 0 | 1 | 2 | 3
}

interface ItemKey {
  /**
   * Plan 2c: baselines are item-keyed. Supply route lines and transfer
   * lines both carry `item_id` directly after the variant-flexibility
   * rollout, so joins through the variant table are no longer needed.
   */
  itemId: string
}

type Db = typeof defaultDb

export async function computeStoreBaseline(
  db: Db,
  args: { storeId: string } & ItemKey,
): Promise<BaselineResult> {
  const rows = await db
    .select({ qty: storeReceivings.quantityReceived })
    .from(storeReceivings)
    .innerJoin(
      supplyRouteLines,
      eq(storeReceivings.supplyRouteLineId, supplyRouteLines.id),
    )
    .where(
      and(
        eq(storeReceivings.storeId, args.storeId),
        eq(supplyRouteLines.itemId, args.itemId),
      ),
    )
    .orderBy(desc(storeReceivings.receivedDate))
    .limit(3)

  return averageBaseline(rows.map((r) => r.qty))
}

export async function computeShopBaseline(
  db: Db,
  args: { shopId: string } & ItemKey,
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
    .where(
      and(
        eq(storeTransfers.shopId, args.shopId),
        eq(storeTransferLines.itemId, args.itemId),
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
