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

/**
 * Banker's-round a UGX amount to the nearest multiple of 50 shillings.
 * Use for sums/aggregates so the displayed total isn't biased low by
 * the per-line floor rule.
 */
export function roundUgxBankers50(amount: BigNumber.Value): BigNumber {
  return new BigNumber(amount)
    .div(STEP)
    .integerValue(BigNumber.ROUND_HALF_EVEN)
    .times(STEP)
}
