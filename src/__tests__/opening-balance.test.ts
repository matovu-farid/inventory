import { describe, it, expect } from "vitest"
import BigNumber from "bignumber.js"
import {
  computeOpeningBalanceTotal,
  validateOpeningBalanceItem,
} from "#/server/functions/admin/opening-balance-validate"

describe("validateOpeningBalanceItem", () => {
  it("accepts a well-formed item", () => {
    expect(() =>
      validateOpeningBalanceItem({
        productName: "Cotton T-Shirt",
        quantity: 10,
        costPerUnitUgx: "15000",
      }),
    ).not.toThrow()
  })

  it("rejects an empty product name", () => {
    expect(() =>
      validateOpeningBalanceItem({
        productName: "   ",
        quantity: 5,
        costPerUnitUgx: "1000",
      }),
    ).toThrow(/product name/i)
  })

  it("rejects zero or negative quantity", () => {
    expect(() =>
      validateOpeningBalanceItem({
        productName: "Shirt",
        quantity: 0,
        costPerUnitUgx: "1000",
      }),
    ).toThrow(/quantity/i)
    expect(() =>
      validateOpeningBalanceItem({
        productName: "Shirt",
        quantity: -3,
        costPerUnitUgx: "1000",
      }),
    ).toThrow(/quantity/i)
  })

  it("rejects non-integer quantity", () => {
    expect(() =>
      validateOpeningBalanceItem({
        productName: "Shirt",
        quantity: 1.5,
        costPerUnitUgx: "1000",
      }),
    ).toThrow(/quantity/i)
  })

  it("rejects zero or negative cost per unit", () => {
    expect(() =>
      validateOpeningBalanceItem({
        productName: "Shirt",
        quantity: 5,
        costPerUnitUgx: "0",
      }),
    ).toThrow(/cost/i)
    expect(() =>
      validateOpeningBalanceItem({
        productName: "Shirt",
        quantity: 5,
        costPerUnitUgx: "-100",
      }),
    ).toThrow(/cost/i)
  })

  it("includes the row index in the error when given", () => {
    expect(() =>
      validateOpeningBalanceItem(
        { productName: "", quantity: 1, costPerUnitUgx: "1" },
        2,
      ),
    ).toThrow(/Row 3/)
  })
})

describe("computeOpeningBalanceTotal", () => {
  it("returns zero for an empty list", () => {
    expect(computeOpeningBalanceTotal([]).toFixed(2)).toBe("0.00")
  })

  it("multiplies quantity by cost per unit and sums", () => {
    const total = computeOpeningBalanceTotal([
      { productName: "A", quantity: 10, costPerUnitUgx: "15000" },
      { productName: "B", quantity: 3, costPerUnitUgx: "2500.50" },
    ])
    // 10 * 15000 + 3 * 2500.50 = 150000 + 7501.50 = 157501.50
    expect(total.toFixed(2)).toBe("157501.50")
  })

  it("preserves precision via BigNumber arithmetic", () => {
    const total = computeOpeningBalanceTotal([
      { productName: "A", quantity: 3, costPerUnitUgx: "0.10" },
      { productName: "B", quantity: 3, costPerUnitUgx: "0.20" },
    ])
    // 0.30 + 0.60 = 0.90 — would suffer from float drift if not BigNumber
    expect(total.eq(new BigNumber("0.90"))).toBe(true)
  })
})
