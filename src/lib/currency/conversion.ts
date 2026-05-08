import BigNumber from "bignumber.js"

/**
 * Convert foreign currency to UGX via USD.
 *
 * Formula from Excel:
 *   Cost(UGX) = unitPriceForeign / exchangeRateForeignToUsd * exchangeRateUsdToUgx * qty
 */
export function foreignToUgx(params: {
  unitPriceForeign: string
  exchangeRateForeignToUsd: string
  exchangeRateUsdToUgx: string
  quantity: number
}): BigNumber {
  const unitPrice = new BigNumber(params.unitPriceForeign)
  const fxToUsd = new BigNumber(params.exchangeRateForeignToUsd)
  const usdToUgx = new BigNumber(params.exchangeRateUsdToUgx)

  if (fxToUsd.lte(0)) throw new Error("Exchange rate (foreign to USD) must be positive")

  return unitPrice.div(fxToUsd).times(usdToUgx).times(params.quantity).dp(2, BigNumber.ROUND_HALF_UP)
}

/**
 * Convert foreign currency to USD.
 */
export function foreignToUsd(params: {
  amountForeign: string
  exchangeRateForeignToUsd: string
}): BigNumber {
  const rate = new BigNumber(params.exchangeRateForeignToUsd)
  if (rate.lte(0)) throw new Error("Exchange rate must be positive")
  return new BigNumber(params.amountForeign).div(rate).dp(2, BigNumber.ROUND_HALF_UP)
}

