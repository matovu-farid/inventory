import { describe, it, expect } from "vitest"
import { shopSaleLineAllocations } from "#/db/schema"

describe("shop_sale_line_allocations schema", () => {
  it("exists with the expected NOT NULL keys", () => {
    expect(shopSaleLineAllocations).toBeDefined()
    const ssl = shopSaleLineAllocations.shopSaleLineId
    const ss = shopSaleLineAllocations.shopStockId
    expect((ssl as { notNull?: boolean }).notNull).toBe(true)
    expect((ss as { notNull?: boolean }).notNull).toBe(true)
  })

  it("has supplyRouteLineId nullable for provenance carry", () => {
    const col = shopSaleLineAllocations.supplyRouteLineId
    expect(col).toBeDefined()
    expect((col as { notNull?: boolean }).notNull).toBeFalsy()
  })

  it("carries a per-allocation cost snapshot", () => {
    const col = shopSaleLineAllocations.costPerUnitUgx
    expect(col).toBeDefined()
    expect((col as { notNull?: boolean }).notNull).toBe(true)
  })
})
