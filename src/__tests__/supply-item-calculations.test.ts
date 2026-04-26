import { describe, it, expect } from "vitest"
import BigNumber from "bignumber.js"

/**
 * Tests for supply route item cost calculations.
 * Mirrors the Excel formula: RATE(rmb) / EX.RATE(rmb/dollar) * USD_RATE(shs/dollar) * QTY
 */

function computeItemCosts(params: {
  unitPriceForeign: string
  foreignCurrency: string
  exchangeRateForeignToUsd?: string
  exchangeRateUsdToUgx?: string
  quantity: number
}) {
  const unitPrice = new BigNumber(params.unitPriceForeign)
  const qty = params.quantity
  const totalAmountForeign = unitPrice.times(qty).toFixed(2)

  let totalAmountUsd: string | null = null
  let totalCostUgx: string

  if (
    params.foreignCurrency === "UGX" ||
    !params.exchangeRateForeignToUsd ||
    !params.exchangeRateUsdToUgx
  ) {
    totalCostUgx = totalAmountForeign
  } else {
    const fxToUsd = new BigNumber(params.exchangeRateForeignToUsd)
    const usdToUgx = new BigNumber(params.exchangeRateUsdToUgx)

    totalAmountUsd = new BigNumber(totalAmountForeign)
      .div(fxToUsd)
      .dp(2, BigNumber.ROUND_HALF_UP)
      .toFixed(2)

    totalCostUgx = unitPrice
      .div(fxToUsd)
      .times(usdToUgx)
      .times(qty)
      .dp(2, BigNumber.ROUND_HALF_UP)
      .toFixed(2)
  }

  return { totalAmountForeign, totalAmountUsd, totalCostUgx }
}

describe("supply route item cost calculations", () => {
  it("computes RMB -> USD -> UGX correctly", () => {
    const result = computeItemCosts({
      unitPriceForeign: "45",
      foreignCurrency: "RMB",
      exchangeRateForeignToUsd: "7.2",
      exchangeRateUsdToUgx: "3700",
      quantity: 20,
    })

    // totalAmountForeign = 45 * 20 = 900
    expect(result.totalAmountForeign).toBe("900.00")

    // totalAmountUsd = 900 / 7.2 = 125.00
    expect(result.totalAmountUsd).toBe("125.00")

    // totalCostUgx = 45 / 7.2 * 3700 * 20 = 462500.00
    expect(result.totalCostUgx).toBe("462500.00")
  })

  it("handles local UGX purchases without conversion", () => {
    const result = computeItemCosts({
      unitPriceForeign: "15000",
      foreignCurrency: "UGX",
      quantity: 10,
    })

    expect(result.totalAmountForeign).toBe("150000.00")
    expect(result.totalAmountUsd).toBeNull()
    expect(result.totalCostUgx).toBe("150000.00")
  })

  it("handles BHT currency", () => {
    const result = computeItemCosts({
      unitPriceForeign: "500",
      foreignCurrency: "BHT",
      exchangeRateForeignToUsd: "35",
      exchangeRateUsdToUgx: "3700",
      quantity: 5,
    })

    // totalAmountForeign = 500 * 5 = 2500
    expect(result.totalAmountForeign).toBe("2500.00")
    // totalAmountUsd = 2500 / 35 = 71.43
    expect(result.totalAmountUsd).toBe("71.43")
    // totalCostUgx = 500 / 35 * 3700 * 5 = 264285.71
    expect(result.totalCostUgx).toBe("264285.71")
  })

  it("handles quantity of 1", () => {
    const result = computeItemCosts({
      unitPriceForeign: "100",
      foreignCurrency: "RMB",
      exchangeRateForeignToUsd: "7.2",
      exchangeRateUsdToUgx: "3700",
      quantity: 1,
    })

    expect(result.totalAmountForeign).toBe("100.00")
    expect(result.totalCostUgx).not.toBe("0.00")
  })

  it("handles very small unit prices", () => {
    const result = computeItemCosts({
      unitPriceForeign: "0.50",
      foreignCurrency: "RMB",
      exchangeRateForeignToUsd: "7.2",
      exchangeRateUsdToUgx: "3700",
      quantity: 1000,
    })

    expect(new BigNumber(result.totalCostUgx).gt(0)).toBe(true)
    expect(new BigNumber(result.totalCostUgx).isFinite()).toBe(true)
  })

  it("matches the Excel formula exactly", () => {
    // From Excel: RATE=45, EX.RATE=7.2, USD_RATE=3700, QTY=20
    // Excel: 45 / 7.2 * 3700 * 20 = 462,500
    const result = computeItemCosts({
      unitPriceForeign: "45",
      foreignCurrency: "RMB",
      exchangeRateForeignToUsd: "7.2",
      exchangeRateUsdToUgx: "3700",
      quantity: 20,
    })

    expect(result.totalCostUgx).toBe("462500.00")
  })
})

describe("cost per unit derivation", () => {
  it("computes cost per unit from total", () => {
    const totalCostUgx = new BigNumber("462500")
    const quantity = 20
    const costPerUnit = totalCostUgx
      .div(quantity)
      .dp(2, BigNumber.ROUND_HALF_UP)

    expect(costPerUnit.toFixed(2)).toBe("23125.00")
  })

  it("handles uneven division", () => {
    const totalCostUgx = new BigNumber("100000")
    const quantity = 3
    const costPerUnit = totalCostUgx
      .div(quantity)
      .dp(2, BigNumber.ROUND_HALF_UP)

    expect(costPerUnit.toFixed(2)).toBe("33333.33")
  })
})
