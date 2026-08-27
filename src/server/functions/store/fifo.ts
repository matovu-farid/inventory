/**
 * `pickStoreStockFifo` — unresolved-first FIFO picker for store_stock.
 *
 * Thin wrapper around the shared `planFifoFromRows` helper
 * (`src/server/functions/_shared/fifo.ts`). Given (storeId, itemId,
 * optional variantId, quantity), returns a per-row allocation plan that
 * drains source `store_stock` rows in the right order. No writes — the
 * caller (Task 7 `createTransfer`, Plan 2b `recordSale`) decides whether
 * to honour the plan or throw on shortfall.
 *
 * Ordering rules:
 *   1. If `variantId` is provided → only rows matching that variant are
 *      eligible. Within them, oldest supply line first.
 *   2. If `variantId` is omitted → unresolved lots (variantId = null)
 *      drain first, then variant lots. Within each group, oldest
 *      supply line first.
 *
 * Why unresolved-first: unresolved lots block downstream
 * variant-specific operations (per Plan 1 variant-flexibility), so any
 * dispatch that *can* drain them should. Variant-keyed lots are still
 * the long-term home of stock.
 *
 * NULL supply line is treated as "older than any dated row" so legacy
 * opening-balance rows (which predate supply lines entirely) drain
 * before any goods-received lot.
 */

import { and, eq } from 'drizzle-orm'

import { storeStock, supplyRouteLines } from '#/db/schema'
import type { DbOrTx } from '#/db'
import { planFifoFromRows } from '#/server/functions/_shared/fifo'

// Re-exported for backward compat — `src/server/functions/shop/fifo.ts`
// and other callers historically imported `DbOrTx` from this module.
// Single source of truth now lives in `src/db/index.ts`.
export type { Tx, DbOrTx } from '#/db'

export interface FifoAllocation {
  storeStockId: string
  quantity: number
  costPerUnitUgx: string
  minimumSellPriceUgx: string
  supplyRouteLineId: string | null
}

export interface FifoPlan {
  allocations: FifoAllocation[]
  shortfall: number
}

export interface FifoInput {
  storeId: string
  itemId: string
  /**
   * If provided, only that variant's stock is considered.
   * If omitted, unresolved lots (variantId = null) drain first, then
   * variant-keyed lots — both groups ordered oldest-supply-line first.
   */
  variantId?: string
  quantity: number
}

export async function pickStoreStockFifo(
  tx: DbOrTx,
  input: FifoInput,
): Promise<FifoPlan> {
  if (input.quantity <= 0) return { allocations: [], shortfall: 0 }

  const conditions = [
    eq(storeStock.storeId, input.storeId),
    eq(storeStock.itemId, input.itemId),
  ]
  if (input.variantId) {
    conditions.push(eq(storeStock.variantId, input.variantId))
  }

  const rows = await tx
    .select({
      id: storeStock.id,
      variantId: storeStock.variantId,
      supplyRouteLineId: storeStock.supplyRouteLineId,
      quantityOnHand: storeStock.quantityOnHand,
      costPerUnitUgx: storeStock.costPerUnitUgx,
      minimumSellPriceUgx: storeStock.minimumSellPriceUgx,
      supplyLineCreatedAt: supplyRouteLines.createdAt,
    })
    .from(storeStock)
    .leftJoin(
      supplyRouteLines,
      eq(supplyRouteLines.id, storeStock.supplyRouteLineId),
    )
    .where(and(...conditions))

  const plan = planFifoFromRows(rows, {
    variantId: input.variantId,
    quantity: input.quantity,
  })

  return {
    allocations: plan.allocations.map((a) => ({
      storeStockId: a.stockId,
      quantity: a.quantity,
      costPerUnitUgx: a.costPerUnitUgx,
      minimumSellPriceUgx: a.minimumSellPriceUgx,
      supplyRouteLineId: a.supplyRouteLineId,
    })),
    shortfall: plan.shortfall,
  }
}
