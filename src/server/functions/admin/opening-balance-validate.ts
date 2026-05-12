import BigNumber from "bignumber.js"

export interface OpeningBalanceCell {
  productColorId: string
  size: string
  quantity: number
}

export interface OpeningBalanceProductEntry {
  productId: string
  unitCostUgx: string
  cells: OpeningBalanceCell[]
}

export function validateOpeningBalanceCell(cell: OpeningBalanceCell, unitCostUgx: string): void {
  if (!cell.productColorId) throw new Error("productColorId is required")
  if (!cell.size) throw new Error("size is required")
  if (!Number.isInteger(cell.quantity) || cell.quantity <= 0) {
    throw new Error("quantity must be a positive integer")
  }
  const cost = new BigNumber(unitCostUgx)
  if (!cost.isFinite() || cost.lte(0)) {
    throw new Error("unitCostUgx must be greater than zero")
  }
}

export function computeOpeningBalanceTotal(entries: OpeningBalanceProductEntry[]): BigNumber {
  return entries.reduce((sum, entry) => {
    const cost = new BigNumber(entry.unitCostUgx)
    const cellTotal = entry.cells.reduce((s, c) => s + c.quantity, 0)
    return sum.plus(cost.times(cellTotal))
  }, new BigNumber(0))
}
