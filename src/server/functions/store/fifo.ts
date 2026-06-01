/**
 * `pickStoreStockFifo` — unresolved-first FIFO picker for store_stock.
 *
 * Pure planning logic: given (storeId, itemId, optional variantId,
 * quantity), returns a per-row allocation plan that drains source
 * `store_stock` rows in the right order. No writes — the caller (Task 7
 * `createTransfer`, Plan 2b `recordSale`) decides whether to honour the
 * plan or throw on shortfall.
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

import { and, eq } from "drizzle-orm"

import { storeStock, supplyRouteLines } from "#/db/schema"
import type { Database } from "#/db"

// Mirrors the pattern in src/server/audit/actor.ts: accept either the
// top-level Database handle or an in-flight transaction. Tests pass
// `db`; Task 7's `createTransfer` will pass a `tx` inside its
// transaction so the FIFO read sees the same snapshot as the writes.
type Tx = Parameters<Parameters<Database["transaction"]>[0]>[0]
export type DbOrTx = Database | Tx

export interface FifoAllocation {
  storeStockId: string
  quantity: number
  costPerUnitUgx: string
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
      supplyLineCreatedAt: supplyRouteLines.createdAt,
    })
    .from(storeStock)
    .leftJoin(
      supplyRouteLines,
      eq(supplyRouteLines.id, storeStock.supplyRouteLineId),
    )
    .where(and(...conditions))

  // Sort: (unresolved-first when variantId is omitted), then oldest
  // supply line first. A NULL supplyLineCreatedAt collates as `0`
  // (epoch) so legacy opening-balance rows drain before any dated lot.
  //
  // We use `[...rows].sort` rather than ES2023 `Array.prototype.toSorted`
  // because the project's tsconfig `lib` targets ES2022.
  const sorted = [...rows].sort((a, b) => {
    if (!input.variantId) {
      const aUnresolved = a.variantId === null
      const bUnresolved = b.variantId === null
      if (aUnresolved !== bUnresolved) return aUnresolved ? -1 : 1
    }
    const at = a.supplyLineCreatedAt?.getTime() ?? 0
    const bt = b.supplyLineCreatedAt?.getTime() ?? 0
    return at - bt
  })

  const allocations: FifoAllocation[] = []
  let remaining = input.quantity
  for (const r of sorted) {
    if (remaining <= 0) break
    if (r.quantityOnHand <= 0) continue
    const take = Math.min(r.quantityOnHand, remaining)
    allocations.push({
      storeStockId: r.id,
      quantity: take,
      costPerUnitUgx: r.costPerUnitUgx,
      supplyRouteLineId: r.supplyRouteLineId,
    })
    remaining -= take
  }

  return { allocations, shortfall: remaining }
}
