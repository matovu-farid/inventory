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

  return unitPrice.div(fxToUsd).times(usdToUgx).times(params.quantity).dp(2, BigNumber.ROUND_HALF_UP)
}

/**
 * Convert foreign currency to USD.
 */
export function foreignToUsd(params: {
  amountForeign: string
  exchangeRateForeignToUsd: string
}): BigNumber {
  return new BigNumber(params.amountForeign)
    .div(params.exchangeRateForeignToUsd)
    .dp(2, BigNumber.ROUND_HALF_UP)
}

/**
 * Format UGX amount for display.
 */
export function formatUgx(amount: string | BigNumber): string {
  const bn = BigNumber.isBigNumber(amount) ? amount : new BigNumber(amount)
  return `UGX ${bn.toFormat(0)}`
}
