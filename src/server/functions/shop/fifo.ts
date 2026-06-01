/**
 * `pickShopStockFifo` — unresolved-first FIFO picker for shop_stock.
 *
 * Pure planning logic mirroring `pickStoreStockFifo`
 * (`src/server/functions/store/fifo.ts`). Given
 * `(shopId, itemId, optional variantId, quantity)`, returns a per-row
 * allocation plan that drains source `shop_stock` rows in the right order.
 * No writes — the caller (Plan 2b `recordSale`, `dispatchStoreReturn`,
 * `recordCustomerReturn`) decides whether to honour the plan or throw on
 * shortfall.
 *
 * Ordering rules:
 *   1. If `variantId` is provided → only rows matching that variant are
 *      eligible. Within them, oldest supply line first.
 *   2. If `variantId` is omitted → unresolved lots (variantId = null)
 *      drain first, then variant lots. Within each group, oldest
 *      supply line first.
 *
 * NULL supply line collates as epoch (`0`) so legacy opening-balance rows
 * drain before any goods-received lot.
 */

import { and, eq } from "drizzle-orm"

import { shopStock, supplyRouteLines } from "#/db/schema"
import type { DbOrTx } from "#/server/functions/store/fifo"

export interface ShopFifoAllocation {
  shopStockId: string
  quantity: number
  costPerUnitUgx: string
  supplyRouteLineId: string | null
}

export interface ShopFifoPlan {
  allocations: ShopFifoAllocation[]
  shortfall: number
}

export interface ShopFifoInput {
  shopId: string
  itemId: string
  /**
   * If provided, only that variant's stock is considered.
   * If omitted, unresolved lots (variantId = null) drain first, then
   * variant-keyed lots — both groups ordered oldest-supply-line first.
   */
  variantId?: string
  quantity: number
}

export async function pickShopStockFifo(
  tx: DbOrTx,
  input: ShopFifoInput,
): Promise<ShopFifoPlan> {
  if (input.quantity <= 0) return { allocations: [], shortfall: 0 }

  const conditions = [
    eq(shopStock.shopId, input.shopId),
    eq(shopStock.itemId, input.itemId),
  ]
  if (input.variantId) {
    conditions.push(eq(shopStock.variantId, input.variantId))
  }

  const rows = await tx
    .select({
      id: shopStock.id,
      variantId: shopStock.variantId,
      supplyRouteLineId: shopStock.supplyRouteLineId,
      quantityOnHand: shopStock.quantityOnHand,
      costPerUnitUgx: shopStock.costPerUnitUgx,
      supplyLineCreatedAt: supplyRouteLines.createdAt,
    })
    .from(shopStock)
    .leftJoin(
      supplyRouteLines,
      eq(supplyRouteLines.id, shopStock.supplyRouteLineId),
    )
    .where(and(...conditions))

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

  const allocations: ShopFifoAllocation[] = []
  let remaining = input.quantity
  for (const r of sorted) {
    if (remaining <= 0) break
    if (r.quantityOnHand <= 0) continue
    const take = Math.min(r.quantityOnHand, remaining)
    allocations.push({
      shopStockId: r.id,
      quantity: take,
      costPerUnitUgx: r.costPerUnitUgx,
      supplyRouteLineId: r.supplyRouteLineId,
    })
    remaining -= take
  }

  return { allocations, shortfall: remaining }
}
