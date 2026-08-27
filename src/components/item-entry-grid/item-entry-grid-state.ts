import BigNumber from 'bignumber.js'
import { ITEM_ENTRY_COLUMNS } from './types'
import { cloneDistribution } from './distribution-state'
import type {
  ItemEntryCellLocation,
  ItemEntryColumnId,
  ItemEntryGridMode,
  ItemEntryRow,
} from './types'

export function createEmptyItemEntryRow(id: string): ItemEntryRow {
  return {
    id,
    itemName: '',
    design: '',
    itemId: null,
    catalogItem: null,
    articleNumber: '',
    colorText: '',
    colorHexText: '',
    colorIds: [],
    sizeText: '',
    quantity: null,
    unitPriceForeign: '',
    minimumSellPriceUgx: '',
    lowStockThreshold: 0,
    distribution: null,
  }
}

export function isItemEntryRowEmpty(row: ItemEntryRow): boolean {
  return (
    !row.design.trim() &&
    !row.itemName.trim() &&
    !row.articleNumber.trim() &&
    !row.colorText.trim() &&
    !row.colorHexText.trim() &&
    !row.sizeText.trim() &&
    row.quantity === null &&
    !row.unitPriceForeign.trim() &&
    !row.minimumSellPriceUgx.trim() &&
    row.lowStockThreshold === 0 &&
    row.distribution === null
  )
}

export function stripEmptyItemEntryRows(rows: ItemEntryRow[]): ItemEntryRow[] {
  return rows.filter((row) => !isItemEntryRowEmpty(row))
}

export function ensureItemEntryRows(
  rows: ItemEntryRow[],
  minimumLength: number,
): ItemEntryRow[] {
  const next = [...rows]
  while (next.length < minimumLength) {
    next.push(createEmptyItemEntryRow(crypto.randomUUID()))
  }
  return next
}

export function addItemEntryRow(rows: ItemEntryRow[]): ItemEntryRow[] {
  const newRow = createEmptyItemEntryRow(crypto.randomUUID())
  const lastRow = rows.at(-1)
  if (!lastRow || !isItemEntryRowEmpty(lastRow)) {
    return [...rows, newRow, createEmptyItemEntryRow(crypto.randomUUID())]
  }
  return [...rows.slice(0, -1), newRow, lastRow]
}

export function removeItemEntryRow(
  rows: ItemEntryRow[],
  rowIndex: number,
): ItemEntryRow[] {
  if (rowIndex < 0 || rowIndex >= rows.length) return rows
  return rows.filter((_, index) => index !== rowIndex)
}

function validNonNegativeMoney(value: string): boolean {
  return /^\d+(\.\d{1,2})?$/.test(value.trim())
}

export function validateItemEntryRows(
  rows: ItemEntryRow[],
  mode: ItemEntryGridMode = 'receipt',
): string | null {
  if (stripEmptyItemEntryRows(rows).length === 0) {
    return mode === 'opening-balance'
      ? 'Add at least one opening-balance line'
      : 'Add at least one complete receipt line'
  }

  const lineLabel = mode === 'opening-balance' ? 'Opening-balance' : 'Receipt'

  for (const [index, row] of rows.entries()) {
    if (isItemEntryRowEmpty(row)) continue
    const label = `${lineLabel} line ${index + 1}`
    if (!row.design.trim()) return `${label}: enter a design`
    if (!row.articleNumber.trim()) return `${label}: enter an art number`
    if (row.quantity === null || row.quantity <= 0) {
      return `${label}: enter a quantity greater than zero`
    }
    if (!row.unitPriceForeign.trim()) {
      return mode === 'opening-balance'
        ? `${label}: enter a unit cost`
        : `${label}: enter a unit price`
    }
    if (!validNonNegativeMoney(row.unitPriceForeign)) {
      return mode === 'opening-balance'
        ? `${label}: enter a unit cost greater than zero`
        : `${label}: enter a valid unit price`
    }
    if (mode === 'opening-balance' && Number(row.unitPriceForeign) <= 0) {
      return `${label}: enter a unit cost greater than zero`
    }
    if (
      mode === 'opening-balance' &&
      row.minimumSellPriceUgx.trim() &&
      (!validNonNegativeMoney(row.minimumSellPriceUgx) ||
        Number(row.minimumSellPriceUgx) < 0)
    ) {
      return `${label}: enter a valid minimum sell price`
    }
    if (
      mode === 'opening-balance' &&
      (!Number.isInteger(row.lowStockThreshold) || row.lowStockThreshold < 0)
    ) {
      return `${label}: enter a valid low-stock threshold`
    }
  }

  return null
}

export function copyItemEntryRow(row: ItemEntryRow, id: string): ItemEntryRow {
  return {
    ...row,
    id,
    colorIds: [...row.colorIds],
    catalogItem: row.catalogItem
      ? {
          ...row.catalogItem,
          articleNumbers: row.catalogItem.articleNumbers.map((article) => ({
            ...article,
          })),
          colors: row.catalogItem.colors.map((color) => ({ ...color })),
          variants: row.catalogItem.variants?.map((variant) => ({
            ...variant,
          })),
        }
      : null,
    distribution: cloneDistribution(row.distribution),
  }
}

export function copyItemEntryRowField(
  row: ItemEntryRow,
  column: ItemEntryColumnId,
): Partial<ItemEntryRow> {
  switch (column) {
    case 'design':
      return {
        itemName: row.itemName,
        design: row.design,
        itemId: row.itemId,
        catalogItem: copyItemEntryRow(row, row.id).catalogItem,
      }
    case 'itemName':
      return { itemName: row.itemName }
    case 'colorText':
      return {
        colorText: row.colorText,
        colorHexText: row.colorHexText,
        colorIds: [...row.colorIds],
      }
    case 'quantity':
      return {
        quantity: row.quantity,
        distribution: cloneDistribution(row.distribution),
      }
    case 'articleNumber':
      return { articleNumber: row.articleNumber }
    case 'sizeText':
      return { sizeText: row.sizeText }
    case 'unitPriceForeign':
      return { unitPriceForeign: row.unitPriceForeign }
    case 'minimumSellPriceUgx':
      return { minimumSellPriceUgx: row.minimumSellPriceUgx }
    case 'lowStockThreshold':
      return { lowStockThreshold: row.lowStockThreshold }
  }
}

export function calculateItemEntryRowAmount(row: ItemEntryRow): string {
  if (!row.quantity || row.quantity <= 0 || !row.unitPriceForeign.trim()) {
    return ''
  }
  const price = new BigNumber(row.unitPriceForeign)
  if (!price.isFinite() || price.isNegative()) return ''
  return price.times(row.quantity).toFixed(2)
}

function parseCellValue(
  column: ItemEntryColumnId,
  value: string,
): Partial<ItemEntryRow> {
  if (column === 'quantity') {
    const trimmed = value.trim()
    if (!trimmed) return { quantity: null }
    const quantity = Number(trimmed)
    return {
      quantity: Number.isInteger(quantity) && quantity >= 0 ? quantity : null,
    }
  }
  if (column === 'lowStockThreshold') {
    const trimmed = value.trim()
    if (!trimmed) return { lowStockThreshold: 0 }
    const threshold = Number(trimmed)
    return {
      lowStockThreshold:
        Number.isInteger(threshold) && threshold >= 0 ? threshold : 0,
    }
  }
  return { [column]: value }
}

export function updateItemEntryCell(
  rows: ItemEntryRow[],
  rowIndex: number,
  column: ItemEntryColumnId,
  value: string,
): ItemEntryRow[] {
  if (rowIndex < 0 || rowIndex >= rows.length) return rows
  const cellPatch = parseCellValue(column, value)
  const clearsDistribution =
    column === 'quantity' || column === 'colorText' || column === 'sizeText'
  return rows.map((row, index) =>
    index === rowIndex
      ? {
          ...row,
          ...cellPatch,
          ...(clearsDistribution ? { distribution: null } : {}),
        }
      : row,
  )
}

export function fillDownItemEntryCells(
  rows: ItemEntryRow[],
  source: ItemEntryCellLocation,
  destinationRows: number[],
): ItemEntryRow[] {
  if (source.row < 0 || source.row >= rows.length) return rows
  const sourceRow = copyItemEntryRow(rows[source.row], rows[source.row].id)
  const next = ensureItemEntryRows(
    rows,
    Math.max(rows.length, ...destinationRows.map((rowIndex) => rowIndex + 1)),
  )
  return destinationRows.reduce(
    (currentRows, rowIndex) =>
      currentRows.map((row, index) =>
        index === rowIndex
          ? { ...row, ...copyItemEntryRowField(sourceRow, source.column) }
          : row,
      ),
    next,
  )
}

export function applyPasteMatrix(
  rows: ItemEntryRow[],
  start: ItemEntryCellLocation,
  matrix: readonly (readonly string[])[],
): ItemEntryRow[] {
  const startColumn = ITEM_ENTRY_COLUMNS.indexOf(start.column)
  if (startColumn < 0) return rows
  return matrix.reduce((next, values, rowOffset) => {
    const targetRow = start.row + rowOffset
    if (!next[targetRow]) return next
    return values.reduce((current, value, columnOffset) => {
      if (startColumn + columnOffset >= ITEM_ENTRY_COLUMNS.length) {
        return current
      }
      const column = ITEM_ENTRY_COLUMNS[startColumn + columnOffset]
      return updateItemEntryCell(current, targetRow, column, value)
    }, next)
  }, rows)
}

export function calculateItemEntryGridTotals(rows: ItemEntryRow[]) {
  const totalAmount = rows.reduce((sum, row) => {
    const quantity = row.quantity
    return typeof quantity === 'number' &&
      Number.isInteger(quantity) &&
      quantity > 0
      ? sum.plus(calculateItemEntryRowAmount(row) || 0)
      : sum
  }, new BigNumber(0))
  return {
    totalPieces: rows.reduce((sum, row) => {
      const quantity = row.quantity
      return typeof quantity === 'number' &&
        Number.isInteger(quantity) &&
        quantity > 0
        ? sum + quantity
        : sum
    }, 0),
    totalAmount: totalAmount.toFixed(2),
  }
}

export function calculateItemEntryReceiptTotals(rows: ItemEntryRow[]) {
  const totals = calculateItemEntryGridTotals(rows)
  return {
    totalPieces: totals.totalPieces,
    totalAmountForeign: totals.totalAmount,
  }
}
