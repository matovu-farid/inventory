import BigNumber from "bignumber.js"

export interface ValidateBelowMinimumSaleInput {
  unitPriceUgx: string
  minimumSellPriceUgx: string
  userRole: string
  reason: string
  productName: string
}

export interface ValidateBelowMinimumSaleResult {
  isBelowMinimum: boolean
  reason: string | null
}

/**
 * Below-minimum sales:
 *   - Blocked entirely for the "sales" role (admin/supervisor approval required).
 *   - Allowed for admin/supervisor, but a non-empty reason is mandatory.
 *
 * Returns { isBelowMinimum, reason } — reason is null when at-or-above minimum.
 * Throws when the rules above are violated.
 */
export function validateBelowMinimumSale(
  input: ValidateBelowMinimumSaleInput,
): ValidateBelowMinimumSaleResult {
  const unitPrice = new BigNumber(input.unitPriceUgx)
  const minPrice = new BigNumber(input.minimumSellPriceUgx)
  const isBelowMinimum = unitPrice.lt(minPrice)

  if (!isBelowMinimum) {
    return { isBelowMinimum: false, reason: null }
  }

  if (input.userRole === "sales") {
    throw new Error(
      `Sale price ${unitPrice.toFixed(0)} is below minimum ${minPrice.toFixed(0)} for ${input.productName}. Requires supervisor approval.`,
    )
  }

  const trimmed = input.reason.trim()
  if (trimmed.length === 0) {
    throw new Error(
      `Reason required for below-minimum sale of ${input.productName} (price ${unitPrice.toFixed(0)} < minimum ${minPrice.toFixed(0)}).`,
    )
  }

  return { isBelowMinimum: true, reason: trimmed }
}
