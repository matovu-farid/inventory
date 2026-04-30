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
