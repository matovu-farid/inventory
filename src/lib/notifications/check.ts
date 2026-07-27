import type { Rule } from '#/lib/notifications/types'

export type CheckReason =
  | 'below'
  | 'above'
  | 'no_baseline_for_percent'
  | 'zero_baseline'

export interface CheckResult {
  below: boolean
  reason: CheckReason
}

export function isBelowThreshold(
  quantityOnHand: number,
  baseline: number | null,
  rule: Rule,
): CheckResult {
  const qoh = Math.max(0, quantityOnHand)
  if (rule.mode === 'units') {
    return qoh <= rule.value
      ? { below: true, reason: 'below' }
      : { below: false, reason: 'above' }
  }
  if (baseline === null) {
    return { below: false, reason: 'no_baseline_for_percent' }
  }
  if (baseline === 0) {
    return { below: false, reason: 'zero_baseline' }
  }
  const ratioPct = (qoh / baseline) * 100
  return ratioPct <= rule.value
    ? { below: true, reason: 'below' }
    : { below: false, reason: 'above' }
}
