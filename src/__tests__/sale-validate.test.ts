import { describe, it, expect } from "vitest"
import { validateBelowMinimumSale } from "#/server/functions/shop/sale-validate"

describe("validateBelowMinimumSale — at or above minimum", () => {
  it("returns isBelowMinimum=false with null reason when price equals minimum", () => {
    const r = validateBelowMinimumSale({
      unitPriceUgx: "10000",
      minimumSellPriceUgx: "10000",
      userRole: "sales",
      reason: "",
      productName: "shirt",
    })
    expect(r).toEqual({ isBelowMinimum: false, reason: null })
  })

  it("returns isBelowMinimum=false with null reason when price is above minimum", () => {
    const r = validateBelowMinimumSale({
      unitPriceUgx: "12000",
      minimumSellPriceUgx: "10000",
      userRole: "sales",
      reason: "",
      productName: "shirt",
    })
    expect(r).toEqual({ isBelowMinimum: false, reason: null })
  })

  it("does not require a reason when price is at-or-above minimum, regardless of role", () => {
    const r = validateBelowMinimumSale({
      unitPriceUgx: "12000",
      minimumSellPriceUgx: "10000",
      userRole: "admin",
      reason: "",
      productName: "shirt",
    })
    expect(r.isBelowMinimum).toBe(false)
  })
})

describe("validateBelowMinimumSale — below minimum (approval gate)", () => {
  it("throws for sales role even with a reason", () => {
    expect(() =>
      validateBelowMinimumSale({
        unitPriceUgx: "8000",
        minimumSellPriceUgx: "10000",
        userRole: "sales",
        reason: "customer haggled",
        productName: "shirt",
      }),
    ).toThrow(/supervisor approval/i)
  })

  it("throws for sales role with empty reason (approval gate trips first)", () => {
    expect(() =>
      validateBelowMinimumSale({
        unitPriceUgx: "8000",
        minimumSellPriceUgx: "10000",
        userRole: "sales",
        reason: "",
        productName: "shirt",
      }),
    ).toThrow(/supervisor approval/i)
  })
})

describe("validateBelowMinimumSale — below minimum (reason required)", () => {
  it("throws for admin without reason", () => {
    expect(() =>
      validateBelowMinimumSale({
        unitPriceUgx: "8000",
        minimumSellPriceUgx: "10000",
        userRole: "admin",
        reason: "",
        productName: "shirt",
      }),
    ).toThrow(/reason required/i)
  })

  it("throws for supervisor with whitespace-only reason", () => {
    expect(() =>
      validateBelowMinimumSale({
        unitPriceUgx: "8000",
        minimumSellPriceUgx: "10000",
        userRole: "supervisor",
        reason: "   ",
        productName: "shirt",
      }),
    ).toThrow(/reason required/i)
  })

  it("returns isBelowMinimum=true and trims the reason for admin with valid reason", () => {
    const r = validateBelowMinimumSale({
      unitPriceUgx: "8000",
      minimumSellPriceUgx: "10000",
      userRole: "admin",
      reason: "  damaged  ",
      productName: "shirt",
    })
    expect(r).toEqual({ isBelowMinimum: true, reason: "damaged" })
  })

  it("returns isBelowMinimum=true for supervisor with valid reason", () => {
    const r = validateBelowMinimumSale({
      unitPriceUgx: "8000",
      minimumSellPriceUgx: "10000",
      userRole: "supervisor",
      reason: "clearance",
      productName: "shirt",
    })
    expect(r.isBelowMinimum).toBe(true)
    expect(r.reason).toBe("clearance")
  })
})
