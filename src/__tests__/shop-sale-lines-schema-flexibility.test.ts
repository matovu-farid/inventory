import { describe, it, expect } from "vitest"
import { shopSaleLines } from "#/db/schema"

describe("shop_sale_lines schema — variant-flexibility", () => {
  it("has item_id as NOT NULL uuid", () => {
    const col = shopSaleLines.itemId
    expect(col).toBeDefined()
    expect((col as { notNull?: boolean }).notNull).toBe(true)
  })

  it("variant_id is nullable", () => {
    const col = shopSaleLines.variantId
    expect(col).toBeDefined()
    expect((col as { notNull?: boolean }).notNull).toBeFalsy()
  })

  it("shop_stock_id is nullable (sale lines reference lots via allocations)", () => {
    const col = shopSaleLines.shopStockId
    expect((col as { notNull?: boolean }).notNull).toBeFalsy()
  })
})
