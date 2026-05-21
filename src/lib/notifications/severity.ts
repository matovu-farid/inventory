import type { Rule } from "#/lib/notifications/types"

export type Severity = "critical" | "warning"

export interface SeverityInput {
  rule: Rule
  baseline: number
  quantityOnHand: number
}

const CRITICAL_RATIO = 0.25

export function severityForAlert(input: SeverityInput): Severity {
  const rank = severityRank(input)
  return rank >= 1 - CRITICAL_RATIO ? "critical" : "warning"
}

/** Returns a number in [0, 1] where 1 = stocked-out. Used to rank alerts. */
export function severityRank(input: SeverityInput): number {
  const qoh = Math.max(0, input.quantityOnHand)
  if (input.rule.mode === "units") {
    const denom = Math.max(1, input.rule.value)
    return clamp01(1 - qoh / denom)
  }
  if (input.baseline <= 0) return 1
  return clamp01(1 - qoh / input.baseline)
}

function clamp01(n: number): number {
  if (n < 0) return 0
  if (n > 1) return 1
  return n
}
