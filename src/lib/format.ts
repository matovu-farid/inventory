import BigNumber from "bignumber.js"

const STEP = new BigNumber(50)

/**
 * Floor a UGX amount to the nearest multiple of 50 shillings, preserving sign.
 * Rounds toward zero (so −1,237 → −1,200, not −1,250).
 */
export function roundUgxFloor50(amount: BigNumber.Value): BigNumber {
  const bn = new BigNumber(amount)
  const sign = bn.isNegative() ? -1 : 1
  return bn.abs().idiv(STEP).times(STEP).times(sign)
}
