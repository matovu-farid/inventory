import { describe, it, expect } from "vitest"
import { computeShopStockMutationsForReturnItem } from "#/server/functions/shop/return-stock-mutations"

/**
 * Tests for GAP-2: in shop returns, when condition === "damaged" the loop
 * comments "intentionally do NOT increment regular stock" but ALSO never
 * increments shopStock.damagedQuantity / damagedValueUgx. The damaged units
 * vanish, then writeOffDamagedGoods can never act on them.
 *
 * Intended pure-helper API:
 *   computeShopStockMutationsForReturnItem({ condition, quantity, unitCostUgx })
 *     -> { field, quantityDelta, valueDelta? }   OR  array of such
 *
 *   Resellable → increment quantityOnHand only.
 *   Damaged → increment damagedQuantity by quantity AND damagedValueUgx by
 *             quantity * unitCostUgx.
 *   quantity = 0 → no-op (or zero deltas).
 */

type Mutation = {
  field: "quantityOnHand" | "damagedQuantity" | "damagedValueUgx"
  quantityDelta?: number
  valueDelta?: string
}

function asArray(m: Mutation | Mutation[] | null | undefined): Mutation[] {
  if (m == null) return []
  return Array.isArray(m) ? m : [m]
}

describe("computeShopStockMutationsForReturnItem — resellable (GAP-2)", () => {
  it("increments quantityOnHand by quantity for resellable returns", () => {
    const result = computeShopStockMutationsForReturnItem({
      condition: "resellable",
      quantity: 3,
      unitCostUgx: "5000",
    })
    const mutations = asArray(result)
    const onHand = mutations.find((m) => m.field === "quantityOnHand")
    expect(onHand?.quantityDelta).toBe(3)
  })

  it("does NOT touch damagedQuantity for resellable returns", () => {
    const result = computeShopStockMutationsForReturnItem({
      condition: "resellable",
      quantity: 3,
      unitCostUgx: "5000",
    })
    const mutations = asArray(result)
    expect(
      mutations.find((m) => m.field === "damagedQuantity"),
    ).toBeUndefined()
    expect(
      mutations.find((m) => m.field === "damagedValueUgx"),
    ).toBeUndefined()
  })
})

describe("computeShopStockMutationsForReturnItem — damaged (GAP-2)", () => {
  it("increments damagedQuantity by quantity for damaged returns", () => {
    const result = computeShopStockMutationsForReturnItem({
      condition: "damaged",
      quantity: 2,
      unitCostUgx: "5000",
    })
    const mutations = asArray(result)
    const dq = mutations.find((m) => m.field === "damagedQuantity")
    expect(dq?.quantityDelta).toBe(2)
  })

  it("increments damagedValueUgx by quantity * unitCostUgx for damaged returns", () => {
    const result = computeShopStockMutationsForReturnItem({
      condition: "damaged",
      quantity: 2,
      unitCostUgx: "5000",
    })
    const mutations = asArray(result)
    // 2 * 5000 = 10000
    const dv = mutations.find(
      (m) => m.field === "damagedValueUgx" || m.valueDelta != null,
    )
    expect(dv?.valueDelta).toBe("10000")
  })

  it("does NOT touch quantityOnHand for damaged returns", () => {
    const result = computeShopStockMutationsForReturnItem({
      condition: "damaged",
      quantity: 2,
      unitCostUgx: "5000",
    })
    const mutations = asArray(result)
    expect(
      mutations.find((m) => m.field === "quantityOnHand"),
    ).toBeUndefined()
  })
})

describe("computeShopStockMutationsForReturnItem — edge cases", () => {
  it("returns no-op for quantity = 0 resellable", () => {
    const result = computeShopStockMutationsForReturnItem({
      condition: "resellable",
      quantity: 0,
      unitCostUgx: "5000",
    })
    const mutations = asArray(result)
    // Either no mutations or all-zero mutations.
    for (const m of mutations) {
      if (m.quantityDelta != null) expect(m.quantityDelta).toBe(0)
      if (m.valueDelta != null) expect(m.valueDelta).toBe("0")
    }
  })

  it("returns no-op for quantity = 0 damaged", () => {
    const result = computeShopStockMutationsForReturnItem({
      condition: "damaged",
      quantity: 0,
      unitCostUgx: "5000",
    })
    const mutations = asArray(result)
    for (const m of mutations) {
      if (m.quantityDelta != null) expect(m.quantityDelta).toBe(0)
      if (m.valueDelta != null) expect(m.valueDelta).toBe("0")
    }
  })
})
