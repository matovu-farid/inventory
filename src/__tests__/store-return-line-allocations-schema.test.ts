import { describe, it, expect } from "vitest"
import { storeReturnLineAllocations } from "#/db/schema"

describe("store_return_line_allocations schema", () => {
  it("exists with the expected NOT NULL keys", () => {
    expect(storeReturnLineAllocations).toBeDefined()
    const srl = storeReturnLineAllocations.storeReturnLineId
    const ss = storeReturnLineAllocations.shopStockId
    expect((srl as { notNull?: boolean }).notNull).toBe(true)
    expect((ss as { notNull?: boolean }).notNull).toBe(true)
  })

  it("has supplyRouteLineId nullable for provenance carry", () => {
    const col = storeReturnLineAllocations.supplyRouteLineId
    expect(col).toBeDefined()
    expect((col as { notNull?: boolean }).notNull).toBeFalsy()
  })

  it("carries a per-allocation cost snapshot", () => {
    const col = storeReturnLineAllocations.costPerUnitUgx
    expect(col).toBeDefined()
    expect((col as { notNull?: boolean }).notNull).toBe(true)
  })
})
