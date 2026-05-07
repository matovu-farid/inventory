import BigNumber from "bignumber.js"

export interface OpeningBalanceItem {
  productName: string
  articleNumber?: string
  quantity: number
  costPerUnitUgx: string
}

/**
 * Validate a single opening-balance line. Throws with a clear, indexable
 * message when the line is invalid. The (optional) index is used to make the
 * error message refer to a specific row in the user's input.
 */
export function validateOpeningBalanceItem(
  item: OpeningBalanceItem,
  index?: number,
): void {
  const where = index !== undefined ? `Row ${index + 1}: ` : ""
  if (!item.productName || item.productName.trim() === "") {
    throw new Error(`${where}Product name is required`)
  }
  if (!Number.isInteger(item.quantity) || item.quantity <= 0) {
    throw new Error(`${where}Quantity must be a positive integer`)
  }
  const cost = new BigNumber(item.costPerUnitUgx)
  if (!cost.isFinite() || cost.lte(0)) {
    throw new Error(`${where}Cost per unit must be greater than zero`)
  }
}

/**
 * Compute the total UGX value of a list of opening-balance items.
 * Returns a BigNumber. Does not validate — callers should validate first.
 */
export function computeOpeningBalanceTotal(
  items: OpeningBalanceItem[],
): BigNumber {
  return items.reduce(
    (sum, i) =>
      sum.plus(new BigNumber(i.costPerUnitUgx).times(i.quantity)),
    new BigNumber(0),
  )
}
