import BigNumber from 'bignumber.js'

export interface ConvertExpenseToUgxInput {
  amount: string
  currency: string
  exchangeRate?: string
}

/**
 * Convert an expense to the ledger currency using the same integer rounding
 * rule used for persisted route-expense journal entries.
 */
export function convertExpenseToUgx(input: ConvertExpenseToUgxInput): string {
  const amount = new BigNumber(input.amount)

  if (!amount.isFinite() || amount.isNegative()) {
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
