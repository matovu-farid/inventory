import BigNumber from 'bignumber.js'
import { calculateReceiptTotals } from '#/lib/supply-receipts'
import { RECEIPT_GRID_COLUMNS } from './types'
import type {
  ReceiptGridCellLocation,
  ReceiptGridColumnId,
  ReceiptGridRow,
} from './types'

export function createEmptyReceiptRow(id: string): ReceiptGridRow {
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
  }
}

export function isReceiptRowEmpty(row: ReceiptGridRow): boolean {
  return (
    !row.design.trim() &&
    !row.itemName.trim() &&
    !row.articleNumber.trim() &&
    !row.colorText.trim() &&
    !row.colorHexText.trim() &&
    !row.sizeText.trim() &&
    row.quantity === null &&
    !row.unitPriceForeign.trim()
  )
}

export function stripEmptyReceiptRows(
  rows: ReceiptGridRow[],
): ReceiptGridRow[] {
  return rows.filter((row) => !isReceiptRowEmpty(row))
}

export function ensureReceiptRows(
  rows: ReceiptGridRow[],
  minimumLength: number,
): ReceiptGridRow[] {
  const next = [...rows]
  while (next.length < minimumLength) {
    next.push(createEmptyReceiptRow(crypto.randomUUID()))
  }
  return next
}

export function addReceiptRow(rows: ReceiptGridRow[]): ReceiptGridRow[] {
  const newRow = createEmptyReceiptRow(crypto.randomUUID())
  const lastRow = rows.at(-1)
  if (!lastRow || !isReceiptRowEmpty(lastRow)) {
    return [...rows, newRow, createEmptyReceiptRow(crypto.randomUUID())]
  }
  return [...rows.slice(0, -1), newRow, lastRow]
}

export function removeReceiptRow(
  rows: ReceiptGridRow[],
  rowIndex: number,
): ReceiptGridRow[] {
  if (rowIndex < 0 || rowIndex >= rows.length) return rows
  return rows.filter((_, index) => index !== rowIndex)
}

export function validateReceiptRows(rows: ReceiptGridRow[]): string | null {
  if (stripEmptyReceiptRows(rows).length === 0) {
    return 'Add at least one complete receipt line'
  }

  for (const [index, row] of rows.entries()) {
    if (isReceiptRowEmpty(row)) continue
    if (!row.design.trim()) return `Receipt line ${index + 1}: enter a design`
    if (!row.articleNumber.trim())
      return `Receipt line ${index + 1}: enter an art number`
    if (row.quantity === null || row.quantity <= 0) {
      return `Receipt line ${index + 1}: enter a quantity greater than zero`
    }
    if (!row.unitPriceForeign.trim()) {
      return `Receipt line ${index + 1}: enter a unit price`
    }
    if (!/^\d+(\.\d{1,2})?$/.test(row.unitPriceForeign.trim())) {
      return `Receipt line ${index + 1}: enter a valid unit price`
    }
  }

  return null
}

export function copyReceiptRow(
  row: ReceiptGridRow,
  id: string,
): ReceiptGridRow {
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
  }
}

export function copyReceiptRowField(
  row: ReceiptGridRow,
  column: ReceiptGridColumnId,
): Partial<ReceiptGridRow> {
  switch (column) {
    case 'design':
      return {
        itemName: row.itemName,
        design: row.design,
        itemId: row.itemId,
        catalogItem: copyReceiptRow(row, row.id).catalogItem,
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
      return { quantity: row.quantity }
    case 'articleNumber':
      return { articleNumber: row.articleNumber }
    case 'sizeText':
      return { sizeText: row.sizeText }
    case 'unitPriceForeign':
      return { [column]: row[column] }
  }
}

export function calculateRowAmount(row: ReceiptGridRow): string {
  if (!row.quantity || row.quantity <= 0 || !row.unitPriceForeign.trim()) {
    return ''
  }
  const price = new BigNumber(row.unitPriceForeign)
  if (!price.isFinite() || price.isNegative()) return ''
  return price.times(row.quantity).toFixed(2)
}

function parseCellValue(
  column: ReceiptGridColumnId,
  value: string,
): Partial<ReceiptGridRow> {
  if (column === 'quantity') {
    const trimmed = value.trim()
    if (!trimmed) return { quantity: null }
    const quantity = Number(trimmed)
    return {
      quantity: Number.isInteger(quantity) && quantity >= 0 ? quantity : null,
    }
  }
  return { [column]: value }
}

export function updateReceiptCell(
  rows: ReceiptGridRow[],
  rowIndex: number,
  column: ReceiptGridColumnId,
  value: string,
): ReceiptGridRow[] {
  if (rowIndex < 0 || rowIndex >= rows.length) return rows
  return rows.map((row, index) =>
    index === rowIndex ? { ...row, ...parseCellValue(column, value) } : row,
  )
}

export function fillDownReceiptCells(
  rows: ReceiptGridRow[],
  source: ReceiptGridCellLocation,
  destinationRows: number[],
): ReceiptGridRow[] {
  if (source.row < 0 || source.row >= rows.length) return rows
  const sourceRow = copyReceiptRow(rows[source.row], rows[source.row].id)
  const next = ensureReceiptRows(
    rows,
    Math.max(rows.length, ...destinationRows.map((rowIndex) => rowIndex + 1)),
  )
  return destinationRows.reduce(
    (currentRows, rowIndex) =>
      currentRows.map((row, index) =>
        index === rowIndex
          ? { ...row, ...copyReceiptRowField(sourceRow, source.column) }
          : row,
      ),
    next,
  )
}

export function applyPasteMatrix(
  rows: ReceiptGridRow[],
  start: ReceiptGridCellLocation,
  matrix: readonly (readonly string[])[],
): ReceiptGridRow[] {
  const startColumn = RECEIPT_GRID_COLUMNS.indexOf(start.column)
  if (startColumn < 0) return rows
  return matrix.reduce((next, values, rowOffset) => {
    const targetRow = start.row + rowOffset
    if (!next[targetRow]) return next
    return values.reduce((current, value, columnOffset) => {
      if (startColumn + columnOffset >= RECEIPT_GRID_COLUMNS.length) {
        return current
      }
      const column = RECEIPT_GRID_COLUMNS[startColumn + columnOffset]
      return updateReceiptCell(current, targetRow, column, value)
    }, next)
  }, rows)
}

export function calculateGridTotals(rows: ReceiptGridRow[]) {
  return calculateReceiptTotals(
    rows.map((row) => ({
      quantity: row.quantity ?? 0,
      unitPriceForeign: row.unitPriceForeign,
    })),
  )
}
