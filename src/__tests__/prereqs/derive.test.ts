import { describe, it, expect } from "vitest"
import {
  deriveReceivingPrereqs,
  deriveTransfersPrereqs,
  deriveShopSalesPrereqs,
  deriveShopOpeningPrereqs,
  deriveShopPrereqs,
  deriveStorePrereqs,
  deriveSupplyPrereqs,
} from "#/lib/prerequisites/derive"

describe("deriveReceivingPrereqs", () => {
  it("is satisfied when ≥1 receivable route exists", () => {
    const result = deriveReceivingPrereqs({ receivableRouteCount: 2 })
    expect(result.satisfied).toBe(true)
    expect(result.missing).toEqual([])
  })

  it("returns soft 'no-receivable-routes' suggestion when count is zero", () => {
    const result = deriveReceivingPrereqs({ receivableRouteCount: 0 })
    expect(result.satisfied).toBe(true)
    expect(result.missing).toHaveLength(1)
    expect(result.missing[0]).toMatchObject({
      id: "no-receivable-routes",
      severity: "soft",
    })
    expect(result.missing[0]!.actions[0]!.href).toBe("/supply")
  })
})

describe("deriveTransfersPrereqs", () => {
  it("is satisfied with ≥1 shop and ≥1 stock row > 0", () => {
    expect(
      deriveTransfersPrereqs({ shopCount: 1, stockRowsWithQty: 5 }).satisfied,
    ).toBe(true)
  })

  it("flags only no-shops when shops missing but stock exists", () => {
    const r = deriveTransfersPrereqs({ shopCount: 0, stockRowsWithQty: 3 })
    expect(r.satisfied).toBe(false)
    expect(r.missing.map((m) => m.id)).toEqual(["no-shops"])
  })

  it("flags only no-store-stock when shops exist but stock is empty", () => {
    const r = deriveTransfersPrereqs({ shopCount: 2, stockRowsWithQty: 0 })
    expect(r.missing.map((m) => m.id)).toEqual(["no-store-stock"])
  })

  it("flags both when both missing", () => {
    const r = deriveTransfersPrereqs({ shopCount: 0, stockRowsWithQty: 0 })
    expect(r.missing.map((m) => m.id).sort()).toEqual([
      "no-shops",
      "no-store-stock",
    ])
  })
})

describe("deriveShopSalesPrereqs", () => {
  it("is satisfied with ≥1 shop and ≥1 sale", () => {
    expect(
      deriveShopSalesPrereqs({ shopCount: 1, totalSaleCount: 1 }).satisfied,
    ).toBe(true)
  })

  it("hard-flags no-shops when zero shops", () => {
    const r = deriveShopSalesPrereqs({ shopCount: 0, totalSaleCount: 0 })
    expect(r.satisfied).toBe(false)
    expect(r.missing[0]!.id).toBe("no-shops")
    expect(r.missing[0]!.severity).toBe("hard")
  })

  it("soft-flags no-sales when shops exist but no sales recorded", () => {
    const r = deriveShopSalesPrereqs({ shopCount: 1, totalSaleCount: 0 })
    expect(r.satisfied).toBe(true)
    expect(r.missing.map((m) => m.id)).toEqual(["no-sales-yet"])
    expect(r.missing[0]!.severity).toBe("soft")
  })
})

describe("deriveShopOpeningPrereqs", () => {
  it("is satisfied with ≥1 shop", () => {
    expect(deriveShopOpeningPrereqs({ shopCount: 1 }).satisfied).toBe(true)
  })

  it("hard-flags no-shops when zero", () => {
    const r = deriveShopOpeningPrereqs({ shopCount: 0 })
    expect(r.satisfied).toBe(false)
    expect(r.missing[0]!.id).toBe("no-shops")
  })
})

describe("deriveShopPrereqs", () => {
  it("is satisfied when no shop selected (page handles its own empty state)", () => {
    expect(deriveShopPrereqs({ selectedShopHasStock: null }).satisfied).toBe(true)
  })

  it("is satisfied when selected shop has stock", () => {
    expect(deriveShopPrereqs({ selectedShopHasStock: true }).satisfied).toBe(true)
  })

  it("soft-flags when selected shop has no stock", () => {
    const r = deriveShopPrereqs({ selectedShopHasStock: false })
    expect(r.satisfied).toBe(true)
    expect(r.missing.map((m) => m.id)).toEqual(["shop-empty"])
    expect(r.missing[0]!.severity).toBe("soft")
  })
})

describe("deriveStorePrereqs", () => {
  it("is satisfied when ≥1 stock row exists", () => {
    expect(deriveStorePrereqs({ stockRowCount: 1 }).satisfied).toBe(true)
  })

  it("soft-flags when warehouse is empty", () => {
    const r = deriveStorePrereqs({ stockRowCount: 0 })
    expect(r.satisfied).toBe(true)
    expect(r.missing.map((m) => m.id)).toEqual(["warehouse-empty"])
    expect(r.missing[0]!.actions).toHaveLength(2)
  })
})

describe("deriveSupplyPrereqs", () => {
  it("is satisfied with ≥1 supplier", () => {
    expect(deriveSupplyPrereqs({ supplierCount: 1 }).satisfied).toBe(true)
  })

  it("soft-flags when zero suppliers", () => {
    const r = deriveSupplyPrereqs({ supplierCount: 0 })
    expect(r.satisfied).toBe(true)
    expect(r.missing.map((m) => m.id)).toEqual(["no-suppliers"])
    expect(r.missing[0]!.actions[0]!.href).toBe("/supply/suppliers")
  })
})
