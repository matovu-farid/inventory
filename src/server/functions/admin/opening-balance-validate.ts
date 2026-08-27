import BigNumber from 'bignumber.js'

export interface OpeningBalanceCell {
  /** Existing variant — lookup by id. Omit when sending colorId+size. */
  variantId?: string | null
  /** Grid cell color — server upserts variant when paired with size. */
  colorId?: string
  colorText?: string
  colorHexText?: string
  size?: string
  quantity: number
}

export interface OpeningBalanceItemEntry {
  itemId: string
  unitCostUgx: string
  cells: OpeningBalanceCell[]
}

export function validateOpeningBalanceCell(
  cell: OpeningBalanceCell,
  unitCostUgx: string,
): void {
  const hasUuid =
    typeof cell.variantId === 'string' && cell.variantId.length > 0
  const isUnresolved =
    cell.variantId === null &&
    cell.colorId === undefined &&
    cell.size === undefined
  const hasPair = cell.colorId !== undefined || cell.size !== undefined
  const hasTextColour = Boolean(cell.colorText?.trim())

  if (cell.variantId === '') {
    throw new Error('variantId must be a uuid, null, or omitted')
  }
  if (cell.variantId === null && hasPair && !hasTextColour) {
    throw new Error(
      'variantId null cannot be combined with colorId+size — use one mode per cell',
    )
  }
  if (!hasUuid && !isUnresolved && !hasTextColour) {
    const hasColor = cell.colorId !== undefined
    const hasSize = cell.size !== undefined && cell.size.trim().length > 0
    if (hasColor !== hasSize) {
      throw new Error('colorId and size must both be provided')
    }
    if (!hasColor) {
      throw new Error(
        'cell must specify variantId, colorId+size, or variantId null for unresolved stock',
      )
    }
  }

  if (!Number.isInteger(cell.quantity) || cell.quantity <= 0) {
    throw new Error('quantity must be a positive integer')
  }
  const cost = new BigNumber(unitCostUgx)
  if (!cost.isFinite() || cost.lte(0)) {
    throw new Error('unitCostUgx must be greater than zero')
  }
}

export function computeOpeningBalanceTotal(
  entries: OpeningBalanceItemEntry[],
): BigNumber {
  return entries.reduce((sum, entry) => {
    const cost = new BigNumber(entry.unitCostUgx)
    const cellTotal = entry.cells.reduce((s, c) => s + c.quantity, 0)
    return sum.plus(cost.times(cellTotal))
  }, new BigNumber(0))
}
