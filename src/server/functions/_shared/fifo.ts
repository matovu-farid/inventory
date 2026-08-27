/**
 * Shared unresolved-first FIFO picker — internal helper.
 *
 * Both `pickStoreStockFifo` (`src/server/functions/store/fifo.ts`) and
 * `pickShopStockFifo` (`src/server/functions/shop/fifo.ts`) were 90%
 * identical. This module hosts the shared sort + allocation loop; the
 * two public wrappers own the table-specific drizzle query (so column
 * types stay tight) and the output shape (`storeStockId` vs
 * `shopStockId`).
 *
 * Ordering rules (load-bearing — do not change without revisiting
 * Plan 2a/2b call sites):
 *   1. If `variantId` is provided → only rows matching that variant are
 *      eligible. Within them, oldest supply line first.
 *   2. If `variantId` is omitted → unresolved lots (variantId = null)
 *      drain first, then variant lots. Within each group, oldest
 *      supply line first.
 *
 * A NULL `supplyLineCreatedAt` collates as `0` (epoch) so legacy
 * opening-balance rows (which predate supply lines entirely) drain
 * before any goods-received lot.
 *
 * We use `[...rows].sort` rather than ES2023 `Array.prototype.toSorted`
 * because the project's tsconfig `lib` targets ES2022.
 */

// Re-exported for backward compat — callers historically imported
// `DbOrTx` from this module. Single source of truth now lives in
// `src/db/index.ts`.
//
// Why DbOrTx: accept either the top-level Database handle or an
// in-flight transaction. Tests pass `db`; production code passes a
// `tx` inside a transaction so the FIFO read sees the same snapshot
// as the writes.
export type { Tx, DbOrTx } from '#/db'

/**
 * Per-row shape the FIFO planner expects from a stock table. Each
 * wrapper projects its drizzle query into this normalised form.
 */
export interface FifoCandidateRow {
  id: string
  variantId: string | null
  supplyRouteLineId: string | null
  quantityOnHand: number
  costPerUnitUgx: string
  minimumSellPriceUgx: string
  supplyLineCreatedAt: Date | null
}

export interface GenericFifoAllocation {
  stockId: string
  quantity: number
  costPerUnitUgx: string
  minimumSellPriceUgx: string
  supplyRouteLineId: string | null
}

export interface GenericFifoPlan {
  allocations: GenericFifoAllocation[]
  shortfall: number
}

export interface PlanFifoOptions {
  /**
   * If set, the helper assumes the caller already restricted candidates
   * to this variant, so the unresolved-first tiebreaker is skipped.
   */
  variantId?: string
  quantity: number
}

/**
 * Sort candidate stock rows by (unresolved-first when variantId is
 * omitted, then oldest supply line first) and drain them until the
 * requested quantity is satisfied. Pure — no I/O.
 */
export function planFifoFromRows(
  rows: readonly FifoCandidateRow[],
  opts: PlanFifoOptions,
): GenericFifoPlan {
  if (opts.quantity <= 0) return { allocations: [], shortfall: 0 }

  const sorted = [...rows].sort((a, b) => {
    if (!opts.variantId) {
      const aUnresolved = a.variantId === null
      const bUnresolved = b.variantId === null
      if (aUnresolved !== bUnresolved) return aUnresolved ? -1 : 1
    }
    const at = a.supplyLineCreatedAt?.getTime() ?? 0
    const bt = b.supplyLineCreatedAt?.getTime() ?? 0
    return at - bt
  })

  const allocations: GenericFifoAllocation[] = []
  let remaining = opts.quantity
  for (const r of sorted) {
    if (remaining <= 0) break
    if (r.quantityOnHand <= 0) continue
    const take = Math.min(r.quantityOnHand, remaining)
    allocations.push({
      stockId: r.id,
      quantity: take,
      costPerUnitUgx: r.costPerUnitUgx,
      minimumSellPriceUgx: r.minimumSellPriceUgx,
      supplyRouteLineId: r.supplyRouteLineId,
    })
    remaining -= take
  }

  return { allocations, shortfall: remaining }
}
