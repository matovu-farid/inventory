import { describe, it, expect } from "vitest"
import { materializeVariantRows } from "#/server/functions/supply/items"

describe("materializeVariantRows", () => {
  it("creates one row per non-zero cell", () => {
    const rows = materializeVariantRows({
      supplyRouteId: "r1", supplierId: "s1",
      unitPriceForeign: "10", foreignCurrency: "RMB",
      exchangeRateForeignToUsd: "7.2", exchangeRateUsdToUgx: "3700",
      cells: [
        { productColorId: "c-red", size: "S", quantity: 3 },
        { productColorId: "c-blue", size: "L", quantity: 2 },
      ],
    })
    expect(rows).toHaveLength(2)
    expect(rows[0].size).toBe("S")
    expect(rows[0].quantity).toBe(3)
    expect(rows[1].productColorId).toBe("c-blue")
    expect(rows[1].quantity).toBe(2)
  })

  it("computes per-row totals", () => {
    const rows = materializeVariantRows({
      supplyRouteId: "r1", supplierId: "s1",
      unitPriceForeign: "45", foreignCurrency: "RMB",
      exchangeRateForeignToUsd: "7.2", exchangeRateUsdToUgx: "3700",
      cells: [{ productColorId: "c1", size: "M", quantity: 20 }],
    })
    expect(rows[0].totalAmountForeign).toBe("900.00")
    expect(rows[0].totalAmountUsd).toBe("125.00")
    expect(rows[0].totalCostUgx).toBe("462500.00")
  })

  it("handles local UGX purchase", () => {
    const rows = materializeVariantRows({
      supplyRouteId: "r1", supplierId: "s1",
      unitPriceForeign: "15000", foreignCurrency: "UGX",
      cells: [{ productColorId: "c1", size: "S", quantity: 10 }],
    })
    expect(rows[0].totalCostUgx).toBe("150000.00")
    expect(rows[0].totalAmountUsd).toBeNull()
  })
})
