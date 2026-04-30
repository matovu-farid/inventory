import { describe, it, expect } from "vitest"
import { prepareImportItem } from "#/server/functions/admin/import-prepare"
import type { ParsedRouteItem } from "#/lib/excel/parser"

/**
 * Tests for BUG-3: import-excel.ts inserts supply_route_items with
 * `supplierId: null as unknown as string`, which violates the NOT NULL FK
 * constraint and crashes at runtime.
 *
 * Intended pure-helper API:
 *   prepareImportItem(parsedItem, supplierId, supplyRouteId) -> NewSupplyRouteItem
 *
 *   - Throws if supplierId is null/undefined/empty
 *   - Throws if supplyRouteId is null/undefined/empty
 *   - Computes totalAmountForeign / totalAmountUsd / totalCostUgx the same
 *     way the importer does today
 *   - Returns a row that can be safely inserted (no `null as unknown as string`
 *     hacks)
 */

const baseItem: ParsedRouteItem = {
  productName: "Red T-Shirt",
  articleNumber: "RT-100",
  quantity: 10,
  unitPriceForeign: "50",
  foreignCurrency: "RMB",
  exchangeRateForeignToUsd: "7.2",
  exchangeRateUsdToUgx: "3800",
}

describe("prepareImportItem — supplier guard (BUG-3)", () => {
  it("throws when supplierId is null", () => {
    expect(() =>
      prepareImportItem(baseItem, null as unknown as string, "route-1"),
    ).toThrow(/supplier/i)
  })

  it("throws when supplierId is undefined", () => {
    expect(() =>
      prepareImportItem(baseItem, undefined as unknown as string, "route-1"),
    ).toThrow(/supplier/i)
  })

  it("throws when supplierId is an empty string", () => {
    expect(() => prepareImportItem(baseItem, "", "route-1")).toThrow(/supplier/i)
  })

  it("throws when supplyRouteId is empty", () => {
    expect(() => prepareImportItem(baseItem, "supplier-1", "")).toThrow(
      /(route|supply)/i,
    )
  })
})

describe("prepareImportItem — row construction", () => {
  it("returns a row whose supplierId is the provided id (not null)", () => {
    const row = prepareImportItem(baseItem, "supplier-abc", "route-1")
    expect(row.supplierId).toBe("supplier-abc")
    // The bug uses `null as unknown as string`. After the fix, the value
    // must be a non-empty string.
    expect(row.supplierId).not.toBeNull()
    expect(row.supplierId).not.toBe("")
  })

  it("includes the supplyRouteId on the row", () => {
    const row = prepareImportItem(baseItem, "supplier-abc", "route-xyz")
    expect(row.supplyRouteId).toBe("route-xyz")
  })

  it("computes totalAmountForeign as quantity * unitPriceForeign", () => {
    const row = prepareImportItem(baseItem, "supplier-abc", "route-1")
    expect(row.totalAmountForeign).toBe("500.00")
  })

  it("computes totalAmountUsd from the foreign->USD rate", () => {
    const row = prepareImportItem(baseItem, "supplier-abc", "route-1")
    // 500 / 7.2 = 69.444...
    expect(row.totalAmountUsd).toBe("69.44")
  })

  it("computes totalCostUgx via the foreign->USD->UGX chain", () => {
    const row = prepareImportItem(baseItem, "supplier-abc", "route-1")
    // (50 / 7.2) * 3800 * 10 = 263888.888... -> "263888.89"
    expect(row.totalCostUgx).toBe("263888.89")
  })

  it("returns null totalAmountUsd when no exchange rate is provided", () => {
    const row = prepareImportItem(
      { ...baseItem, exchangeRateForeignToUsd: null, exchangeRateUsdToUgx: null },
      "supplier-abc",
      "route-1",
    )
    expect(row.totalAmountUsd).toBeNull()
    expect(row.totalCostUgx).toBe("0")
  })

  it("preserves productName and articleNumber from the parsed item", () => {
    const row = prepareImportItem(baseItem, "supplier-abc", "route-1")
    expect(row.productName).toBe("Red T-Shirt")
    expect(row.articleNumber).toBe("RT-100")
  })
})
