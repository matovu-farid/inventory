export interface OriginalEntry {
  type: "debit" | "credit"
  amount: string
  categoryId: string
  locationType: "store" | "shop"
  locationId: string
  bankAccountId: string | null
  depositLocation: "cash" | "bank" | null
  referenceType: string | null
  referenceId: string | null
  description: string | null
}

export interface ReversalEntry extends OriginalEntry {
  recordedBy: string
}

export interface ReversalParams {
  reason: string
  recordedBy: string
}

export function buildReversalEntries(
  entries: OriginalEntry[],
  params: ReversalParams,
): ReversalEntry[] {
  if (entries.length === 0) {
    throw new Error("reversal: cannot reverse an empty entry list")
  }
  if (!params.reason) throw new Error("reversal: reason required")
  if (!params.recordedBy) throw new Error("reversal: recordedBy required")

  return entries.map((entry) => ({
    ...entry,
    type: entry.type === "debit" ? "credit" : "debit",
    referenceType: "reversal",
    description: `Reversal: ${params.reason}`,
    recordedBy: params.recordedBy,
  }))
}
