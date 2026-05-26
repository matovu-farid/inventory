import BigNumber from "bignumber.js"

export interface OpeningBalanceCell {
  // Variant the cell creates stock for. Replaces the legacy
  // (productColorId, size) shape in #6 — opening balance now points at a
  // pre-materialised variant rather than reaching for one by (color, size).
  variantId: string
  quantity: number
}

export interface OpeningBalanceProductEntry {
  // Renamed from `productId` for #6 — matches the catalog vocabulary the
  // rest of the schema settled on after #3 (products → items).
  itemId: string
  unitCostUgx: string
  cells: OpeningBalanceCell[]
}

export function validateOpeningBalanceCell(cell: OpeningBalanceCell, unitCostUgx: string): void {
  if (!cell.variantId) throw new Error("variantId is required")
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
