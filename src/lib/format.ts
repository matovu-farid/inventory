import BigNumber from "bignumber.js"

const STEP = new BigNumber(50)

/**
 * Format a date as a calendar date (no time component) using the runtime's
 * default locale. Use for table cells and summaries where only the day matters.
 */
export function formatDate(date: Date | string): string {
  const d = typeof date === "string" ? new Date(date) : date
  return d.toLocaleDateString()
}

/**
 * Format a date with time using the runtime's default locale. Use for sale
 * receipts, audit-log rows, and anywhere the time-of-day matters.
 */
export function formatDateTime(date: Date | string): string {
  const d = typeof date === "string" ? new Date(date) : date
  return d.toLocaleString()
}

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

function formatRounded(rounded: BigNumber): string {
  // Normalise negative zero to zero so toFormat produces "0" not "-0" / "-"
  const normalised = rounded.isZero() ? new BigNumber(0) : rounded
  return `${normalised.toFormat(0)} UGX`
}

/**
 * Format a single UGX amount for display: floor to nearest 50, comma thousands,
 * trailing " UGX". Use for unit prices, line totals, individual amounts.
 */
export function formatUgx(amount: BigNumber.Value): string {
  return formatRounded(roundUgxFloor50(amount))
}

/**
 * Format a UGX aggregate for display: banker's-round to nearest 50, comma
 * thousands, trailing " UGX". Use for KPI cards, table-footer totals,
 * "Total"-labeled summary values.
 */
export function formatUgxTotal(amount: BigNumber.Value): string {
  return formatRounded(roundUgxBankers50(amount))
}
