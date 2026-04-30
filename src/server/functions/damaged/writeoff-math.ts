import BigNumber from "bignumber.js"

export interface ComputeWriteOffAmountInput {
  damagedQuantity: number
  damagedValueUgx: string
  writeOffQuantity: number
}

/**
 * Compute the UGX amount to remove from the damaged inventory bucket when
 * writing off `writeOffQuantity` units.
 *
 * The amount is proportional to the bucket's average basis:
 *   amount = (damagedValueUgx / damagedQuantity) * writeOffQuantity
 *
 * Returned as a BigNumber-string with 2 decimal places (HALF_UP rounding).
 *
 * Throws on:
 *   - non-positive writeOffQuantity
 *   - negative damagedQuantity / damagedValueUgx
 *   - empty damaged bucket (damagedQuantity === 0)
 *   - writeOffQuantity > damagedQuantity
 */
export function computeWriteOffAmount(input: ComputeWriteOffAmountInput): string {
  const { damagedQuantity, writeOffQuantity } = input
  const damagedValueUgx = new BigNumber(input.damagedValueUgx)

  if (writeOffQuantity <= 0) {
    throw new Error(
      `computeWriteOffAmount: writeOffQuantity must be positive (got ${writeOffQuantity})`,
    )
  }
  if (damagedQuantity < 0) {
    throw new Error(
      `computeWriteOffAmount: damagedQuantity cannot be negative (got ${damagedQuantity})`,
    )
  }
  if (damagedValueUgx.isNegative()) {
    throw new Error(
      `computeWriteOffAmount: damagedValueUgx cannot be negative (got ${input.damagedValueUgx})`,
    )
  }
  if (damagedQuantity === 0) {
    throw new Error(
      "computeWriteOffAmount: damaged bucket is empty (no damaged units to write off)",
    )
  }
  if (writeOffQuantity > damagedQuantity) {
    throw new Error(
      `computeWriteOffAmount: writeOffQuantity (${writeOffQuantity}) exceeds damagedQuantity (${damagedQuantity})`,
    )
  }

  // Whole-bucket write-off: return the full value verbatim (avoids any
  // rounding drift from per-unit division).
  if (writeOffQuantity === damagedQuantity) {
    return damagedValueUgx.toFixed(2)
  }

  const perUnit = damagedValueUgx.dividedBy(damagedQuantity)
  return perUnit
    .multipliedBy(writeOffQuantity)
    .toFixed(2, BigNumber.ROUND_HALF_UP)
}
