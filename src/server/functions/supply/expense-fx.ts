import BigNumber from 'bignumber.js'

export interface ConvertExpenseToUgxInput {
  amount: string
  currency: string
  exchangeRate?: string
}

/**
 * Convert a supply-route expense amount into UGX (the ledger currency).
 *
 *   - currency === "UGX": amount passes through unchanged (rate ignored).
 *   - currency !== "UGX": requires a positive exchangeRate; result is
 *     amount * exchangeRate, rounded to a UGX integer (no decimals).
 *
 * Throws on:
 *   - negative amount
 *   - non-UGX currency without (positive) exchangeRate
 */
export function convertExpenseToUgx(input: ConvertExpenseToUgxInput): string {
  const amount = new BigNumber(input.amount)

  if (amount.isNegative()) {
    throw new Error(
      `convertExpenseToUgx: amount must be non-negative (got ${input.amount})`,
    )
  }

  if (input.currency === 'UGX') {
    return input.amount
  }

  if (input.exchangeRate === undefined) {
    throw new Error(
      `convertExpenseToUgx: exchangeRate is required for non-UGX currency (${input.currency})`,
    )
  }

  const rate = new BigNumber(input.exchangeRate)
  if (!rate.isFinite() || rate.lte(0)) {
    throw new Error(
      `convertExpenseToUgx: exchangeRate must be positive (got ${input.exchangeRate})`,
    )
  }

  return amount.multipliedBy(rate).dp(0, BigNumber.ROUND_HALF_UP).toFixed(0)
}
