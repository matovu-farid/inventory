import BigNumber from "bignumber.js"

export type ShopStockMutationField =
  | "quantityOnHand"
  | "damagedQuantity"

export interface ShopStockMutation {
  field: ShopStockMutationField
  quantityDelta: number
  /** Only present for damaged-bucket mutations (UGX value to add). */
  valueDelta?: string
}

export interface ComputeShopStockMutationsInput {
  condition: "resellable" | "damaged"
  quantity: number
  unitCostUgx: string
}

/**
 * Compute the shop_stock column mutations for a single return-item line.
 *
 *   resellable, qty > 0 -> increment quantityOnHand by qty
 *   damaged,    qty > 0 -> increment damagedQuantity by qty AND
 *                          damagedValueUgx by qty * unitCostUgx
 *   qty === 0           -> no-op (empty array)
 */
export function computeShopStockMutationsForReturnItem(
  input: ComputeShopStockMutationsInput,
): ShopStockMutation[] {
  if (input.quantity === 0) return []

  if (input.condition === "resellable") {
    return [{ field: "quantityOnHand", quantityDelta: input.quantity }]
  }

  const valueDelta = new BigNumber(input.unitCostUgx)
    .multipliedBy(input.quantity)
    .toFixed()
  return [
    {
      field: "damagedQuantity",
      quantityDelta: input.quantity,
      valueDelta,
    },
  ]
}
