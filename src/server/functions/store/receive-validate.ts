export interface ValidateDiscrepancyNotesInput {
  quantityExpected: number
  quantityReceived: number
  discrepancyNotes?: string | null
}

export function validateQuantityReceived(quantityReceived: number): void {
  if (quantityReceived < 0) {
    throw new Error(
      `validateQuantityReceived: quantityReceived must be non-negative (got ${quantityReceived})`,
    )
  }
}

/**
 * Require an explanation when fewer items arrived than expected (transit loss).
 */
export function validateDiscrepancyNotes(
  input: ValidateDiscrepancyNotesInput,
): void {
  if (input.quantityReceived >= input.quantityExpected) return
  const note = (input.discrepancyNotes ?? "").trim()
  if (note.length === 0) {
    throw new Error(
      `Discrepancy notes required: received ${input.quantityReceived} of ${input.quantityExpected} expected`,
    )
  }
}
