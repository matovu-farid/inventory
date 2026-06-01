import BigNumber from "bignumber.js"

export interface OpeningBalanceCell {
  // Variant the cell creates stock for. Replaces the legacy
  // (itemColorId, size) shape in #6 — opening balance now points at a
  // pre-materialised variant rather than reaching for one by (color, size).
  //
  // Plan 2a (Task 3): `variantId` is optional. When null/omitted the cell
  // creates a variant-less (aggregate / unresolved) stock row — used by
  // the Excel importer when the source sheet only carries item info.
  variantId: string | null
  quantity: number
}

export interface OpeningBalanceItemEntry {
  // Renamed from `itemId` for #6 — matches the catalog vocabulary the
  // rest of the schema settled on after #3 (products → items).
  itemId: string
  unitCostUgx: string
  cells: OpeningBalanceCell[]
}

export function validateOpeningBalanceCell(cell: OpeningBalanceCell, unitCostUgx: string): void {
  // variantId is intentionally nullable — see Plan 2a Task 3. We only
  // reject an explicit empty-string (a likely accidental UI submission)
  // and accept `null` / `undefined` as "unresolved row, write variantId
  // = NULL into shop_stock".
  if (cell.variantId === "") throw new Error("variantId must be a uuid or null")
  if (!Number.isInteger(cell.quantity) || cell.quantity <= 0) {
    throw new Error("quantity must be a positive integer")
  }
  const cost = new BigNumber(unitCostUgx)
  if (!cost.isFinite() || cost.lte(0)) {
    throw new Error("unitCostUgx must be greater than zero")
  }
}

export function computeOpeningBalanceTotal(entries: OpeningBalanceItemEntry[]): BigNumber {
  return entries.reduce((sum, entry) => {
    const cost = new BigNumber(entry.unitCostUgx)
    const cellTotal = entry.cells.reduce((s, c) => s + c.quantity, 0)
    return sum.plus(cost.times(cellTotal))
  }, new BigNumber(0))
}
