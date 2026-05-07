export interface ValidateReceiveItemInput {
  quantityReceived: number
  quantityDamaged: number
}

export interface ValidateReceiveItemResult {
  usableQty: number
}

/**
 * Guard the receive-goods quantities so usable stock can never go negative.
 *
 * Throws when:
 *   - either input is negative
 *   - quantityDamaged exceeds quantityReceived
 *
 * Returns { usableQty: quantityReceived - quantityDamaged } otherwise.
 */
export function validateReceiveItem(
  input: ValidateReceiveItemInput,
): ValidateReceiveItemResult {
  const { quantityReceived, quantityDamaged } = input

  if (quantityReceived < 0) {
    throw new Error(
      `validateReceiveItem: quantityReceived must be non-negative (got ${quantityReceived})`,
    )
  }
  if (quantityDamaged < 0) {
    throw new Error(
      `validateReceiveItem: quantityDamaged must be non-negative (got ${quantityDamaged})`,
    )
  }
  if (quantityDamaged > quantityReceived) {
    throw new Error(
      `validateReceiveItem: quantityDamaged (${quantityDamaged}) cannot exceed quantityReceived (${quantityReceived})`,
    )
  }

  return { usableQty: quantityReceived - quantityDamaged }
}

export interface ValidateDiscrepancyNotesInput {
  quantityExpected: number
  quantityReceived: number
  discrepancyNotes?: string | null
}

/**
 * Require an explanation when fewer items arrived than expected (transit loss).
 * Damaged-but-arrived items don't trigger this — only missing items do.
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
