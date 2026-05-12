import { describe, it, expect } from "vitest"
import BigNumber from "bignumber.js"
import {
  computeOpeningBalanceTotal,
  validateOpeningBalanceCell,
} from "#/server/functions/admin/opening-balance-validate"

const PC = "00000000-0000-0000-0000-000000000001"

describe("validateOpeningBalanceCell", () => {
  it("accepts a well-formed cell", () => {
    expect(() =>
      validateOpeningBalanceCell(
        { productColorId: PC, size: "M", quantity: 10 },
        "15000",
      ),
    ).not.toThrow()
  })

  it("rejects a missing productColorId", () => {
    expect(() =>
      validateOpeningBalanceCell(
        { productColorId: "", size: "M", quantity: 5 },
        "1000",
      ),
    ).toThrow(/productColorId/i)
  })

  it("rejects a missing size", () => {
    expect(() =>
      validateOpeningBalanceCell(
        { productColorId: PC, size: "", quantity: 5 },
        "1000",
      ),
    ).toThrow(/size/i)
  })

  it("rejects zero or negative quantity", () => {
    expect(() =>
      validateOpeningBalanceCell(
        { productColorId: PC, size: "M", quantity: 0 },
        "1000",
      ),
    ).toThrow(/quantity/i)
    expect(() =>
      validateOpeningBalanceCell(
        { productColorId: PC, size: "M", quantity: -3 },
        "1000",
      ),
    ).toThrow(/quantity/i)
  })

  it("rejects non-integer quantity", () => {
    expect(() =>
      validateOpeningBalanceCell(
        { productColorId: PC, size: "M", quantity: 1.5 },
        "1000",
      ),
    ).toThrow(/quantity/i)
  })

  it("rejects zero or negative unit cost", () => {
    expect(() =>
      validateOpeningBalanceCell(
        { productColorId: PC, size: "M", quantity: 5 },
        "0",
      ),
    ).toThrow(/unitCostUgx/i)
    expect(() =>
      validateOpeningBalanceCell(
        { productColorId: PC, size: "M", quantity: 5 },
        "-100",
      ),
    ).toThrow(/unitCostUgx/i)
  })
})

describe("computeOpeningBalanceTotal", () => {
  it("returns zero for an empty list", () => {
    expect(computeOpeningBalanceTotal([]).toFixed(2)).toBe("0.00")
  })

  it("multiplies cell quantities by entry unit cost and sums", () => {
    // Ported scenario: "two products with different costs" — one entry per
    // product, each with a single cell carrying the original quantity.
    const total = computeOpeningBalanceTotal([
      {
        productId: "p-1",
        unitCostUgx: "15000",
        cells: [{ productColorId: PC, size: "M", quantity: 10 }],
      },
      {
        productId: "p-2",
        unitCostUgx: "2500.50",
        cells: [{ productColorId: PC, size: "M", quantity: 3 }],
      },
    ])
    // 10 * 15000 + 3 * 2500.50 = 150000 + 7501.50 = 157501.50
    expect(total.toFixed(2)).toBe("157501.50")
  })

  it("preserves precision via BigNumber arithmetic", () => {
    const total = computeOpeningBalanceTotal([
      {
        productId: "p-1",
        unitCostUgx: "0.10",
        cells: [{ productColorId: PC, size: "M", quantity: 3 }],
      },
      {
        productId: "p-2",
        unitCostUgx: "0.20",
        cells: [{ productColorId: PC, size: "M", quantity: 3 }],
      },
    ])
    // 0.30 + 0.60 = 0.90 — would suffer from float drift if not BigNumber
    expect(total.eq(new BigNumber("0.90"))).toBe(true)
  })

  it("sums multiple cells within one product entry", () => {
    // New shape allows multiple variant cells under one product — they all
    // share the same unitCostUgx and contribute to the entry total.
    const total = computeOpeningBalanceTotal([
      {
        productId: "p-1",
        unitCostUgx: "10000",
        cells: [
          { productColorId: PC, size: "S", quantity: 5 },
          { productColorId: PC, size: "M", quantity: 3 },
        ],
      },
    ])
    // (5 + 3) * 10000 = 80000
    expect(total.toFixed(2)).toBe("80000.00")
  })
})
