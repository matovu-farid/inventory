import BigNumber from 'bignumber.js'
import type { ItemSummary } from '#/components/items/item-picker'

export const OPENING_BALANCE_COLUMNS = [
  'item',
  'color',
  'size',
  'quantity',
  'unitCostUgx',
  'minimumSellPriceUgx',
  'lowStockThreshold',
] as const

export type OpeningBalanceColumnId = (typeof OPENING_BALANCE_COLUMNS)[number]

export interface OpeningBalanceTableRow {
  id: string
  itemId: string | null
  item: ItemSummary | null
  colorId: string
  size: string
  variantId: string | null
  quantity: number | null
  unitCostUgx: string
  minimumSellPriceUgx: string
  lowStockThreshold: number
}

export interface OpeningBalancePayloadCell {
  variantId?: string | null
  colorId?: string
  size?: string
  quantity: number
}

export interface OpeningBalancePayloadEntry {
  itemId: string
  unitCostUgx: string
  minimumSellPriceUgx: string
  lowStockThreshold: number
  cells: OpeningBalancePayloadCell[]
}

export interface OpeningBalanceCellLocation {
  row: number
  column: OpeningBalanceColumnId
}

export function createEmptyOpeningBalanceRow(
  id: string,
): OpeningBalanceTableRow {
  return {
    id,
    itemId: null,
    item: null,
    colorId: '',
    size: '',
    variantId: null,
    quantity: null,
    unitCostUgx: '',
    minimumSellPriceUgx: '',
    lowStockThreshold: 0,
  }
}

export function rowForOpeningBalanceItem(
  id: string,
  item: ItemSummary,
): OpeningBalanceTableRow {
  return {
    ...createEmptyOpeningBalanceRow(id),
    itemId: item.id,
    item,
    minimumSellPriceUgx: item.minimumSellPriceUgx ?? '0',
    lowStockThreshold: item.lowStockThreshold ?? 0,
  }
}

export function isOpeningBalanceRowEmpty(row: OpeningBalanceTableRow): boolean {
  return (
    !row.itemId &&
    !row.colorId &&
    !row.size.trim() &&
    row.quantity === null &&
    !row.unitCostUgx.trim() &&
    !row.minimumSellPriceUgx.trim() &&
    row.lowStockThreshold === 0
  )
}

export function ensureOpeningBalanceRows(
  rows: OpeningBalanceTableRow[],
  minimumLength: number,
): OpeningBalanceTableRow[] {
  const next = [...rows]
  while (next.length < minimumLength) {
    next.push(createEmptyOpeningBalanceRow(crypto.randomUUID()))
  }
  return next
}

export function addOpeningBalanceRow(
  rows: OpeningBalanceTableRow[],
): OpeningBalanceTableRow[] {
  const blank = createEmptyOpeningBalanceRow(crypto.randomUUID())
  const last = rows.at(-1)
  if (!last || !isOpeningBalanceRowEmpty(last)) return [...rows, blank]
  return [...rows.slice(0, -1), blank, last]
}

export function removeOpeningBalanceRow(
  rows: OpeningBalanceTableRow[],
  rowIndex: number,
): OpeningBalanceTableRow[] {
  if (rowIndex < 0 || rowIndex >= rows.length) return rows
  const next = rows.filter((_, index) => index !== rowIndex)
  return next.length > 0
    ? next
    : [createEmptyOpeningBalanceRow(crypto.randomUUID())]
}

export function calculateOpeningBalanceRowAmount(
  row: OpeningBalanceTableRow,
): string {
  if (row.quantity === null || row.quantity <= 0) return ''
  if (!row.unitCostUgx.trim()) return ''
  const cost = new BigNumber(row.unitCostUgx)
  if (!cost.isFinite() || cost.isNegative()) return ''
  return cost.times(row.quantity).toFixed(2)
}

function validNonNegativeMoney(value: string): boolean {
  return /^\d+(\.\d{1,2})?$/.test(value.trim())
}

function rowVariantKey(row: OpeningBalanceTableRow): string {
  if (row.variantId) return `variant:${row.variantId}`
  if (row.colorId && row.size.trim()) {
    const existingVariant = row.item?.variants?.find(
      (variant) =>
        variant.colorId === row.colorId &&
        variant.size.trim().toLocaleLowerCase() ===
          row.size.trim().toLocaleLowerCase(),
    )
    if (existingVariant) return `variant:${existingVariant.id}`
    return `pair:${row.colorId}:${row.size.trim().toLocaleLowerCase()}`
  }
  return 'unresolved'
}

export function validateOpeningBalanceRows(
  rows: OpeningBalanceTableRow[],
): string | null {
  const populated = rows.filter((row) => !isOpeningBalanceRowEmpty(row))
  if (populated.length === 0) return 'Add at least one opening-balance line'

  const seen = new Set<string>()
  for (const [index, row] of rows.entries()) {
    if (isOpeningBalanceRowEmpty(row)) continue
    const label = `Opening-balance line ${index + 1}`
    if (!row.itemId || !row.item) return `${label}: select an item`
    if (row.colorId && !row.size.trim()) {
      return `${label}: choose both colour and size, or leave both blank`
    }
    if (!row.colorId && row.size.trim()) {
      return `${label}: choose both colour and size, or leave both blank`
    }
    if (row.quantity === null || row.quantity <= 0) {
      return `${label}: enter a quantity greater than zero`
    }
    if (
      !validNonNegativeMoney(row.unitCostUgx) ||
      Number(row.unitCostUgx) <= 0
    ) {
      return `${label}: enter a unit cost greater than zero`
    }
    if (
      !validNonNegativeMoney(row.minimumSellPriceUgx || '0') ||
      Number(row.minimumSellPriceUgx || '0') < 0
    ) {
      return `${label}: enter a valid minimum sell price`
    }
    if (!Number.isInteger(row.lowStockThreshold) || row.lowStockThreshold < 0) {
      return `${label}: enter a valid low-stock threshold`
    }
    const key = `${row.itemId}:${rowVariantKey(row)}`
    if (seen.has(key)) return `${label}: duplicate item and variant`
    seen.add(key)
  }
  return null
}

function normalizedMinimumSellPrice(row: OpeningBalanceTableRow): string {
  return new BigNumber(row.minimumSellPriceUgx || '0').toFixed(2)
}

function cellForRow(row: OpeningBalanceTableRow): OpeningBalancePayloadCell {
  if (row.variantId) {
    return { variantId: row.variantId, quantity: row.quantity ?? 0 }
  }
  if (row.colorId && row.size.trim()) {
    const existingVariant = row.item?.variants?.find(
      (variant) =>
        variant.colorId === row.colorId && variant.size === row.size.trim(),
    )
    if (existingVariant) {
      return { variantId: existingVariant.id, quantity: row.quantity ?? 0 }
    }
    return {
      colorId: row.colorId,
      size: row.size.trim(),
      quantity: row.quantity ?? 0,
    }
  }
  return { variantId: null, quantity: row.quantity ?? 0 }
}

export function groupOpeningBalanceRows(
  rows: OpeningBalanceTableRow[],
): OpeningBalancePayloadEntry[] {
  const validationError = validateOpeningBalanceRows(rows)
  if (validationError) throw new Error(validationError)

  const groups = new Map<string, OpeningBalancePayloadEntry>()
  for (const row of rows) {
    if (isOpeningBalanceRowEmpty(row)) continue
    const key = [
      row.itemId,
      row.unitCostUgx.trim(),
      normalizedMinimumSellPrice(row),
      row.lowStockThreshold,
    ].join(':')
    const existing = groups.get(key)
    const entry = existing ?? {
      itemId: row.itemId as string,
      unitCostUgx: new BigNumber(row.unitCostUgx).toFixed(2),
      minimumSellPriceUgx: normalizedMinimumSellPrice(row),
      lowStockThreshold: row.lowStockThreshold,
      cells: [],
    }
    entry.cells.push(cellForRow(row))
    groups.set(key, entry)
  }
  return [...groups.values()]
}

function copiedField(
  row: OpeningBalanceTableRow,
  column: OpeningBalanceColumnId,
): Partial<OpeningBalanceTableRow> {
  switch (column) {
    case 'item':
      return {
        itemId: row.itemId,
        item: row.item,
        colorId: '',
        size: '',
        variantId: null,
        quantity: null,
        unitCostUgx: '',
        minimumSellPriceUgx: row.minimumSellPriceUgx,
        lowStockThreshold: row.lowStockThreshold,
      }
    case 'color':
      return { colorId: row.colorId, variantId: null }
    case 'size':
      return { size: row.size, variantId: null }
    case 'quantity':
      return { quantity: row.quantity }
    case 'unitCostUgx':
      return { unitCostUgx: row.unitCostUgx }
    case 'minimumSellPriceUgx':
      return { minimumSellPriceUgx: row.minimumSellPriceUgx }
    case 'lowStockThreshold':
      return { lowStockThreshold: row.lowStockThreshold }
  }
}

export function fillDownOpeningBalanceCells(
  rows: OpeningBalanceTableRow[],
  source: OpeningBalanceCellLocation,
  destinationRows: number[],
): OpeningBalanceTableRow[] {
  const sourceRow = rows.at(source.row)
  if (!sourceRow) return rows
  const largestTarget = Math.max(source.row, ...destinationRows)
  const next = ensureOpeningBalanceRows(rows, largestTarget + 1)
  const fields = copiedField(sourceRow, source.column)
  return destinationRows.reduce(
    (current, rowIndex) =>
      current.map((row, index) =>
        index !== rowIndex
          ? row
          : source.column === 'color' || source.column === 'size'
            ? row.itemId === sourceRow.itemId || !row.itemId
              ? {
                  ...row,
                  ...(row.itemId
                    ? {}
                    : {
                        itemId: sourceRow.itemId,
                        item: sourceRow.item,
                        minimumSellPriceUgx: sourceRow.minimumSellPriceUgx,
                        lowStockThreshold: sourceRow.lowStockThreshold,
                        quantity: null,
                        unitCostUgx: '',
                      }),
                  ...fields,
                }
              : { ...row, colorId: '', size: '', variantId: null }
            : { ...row, ...fields },
      ),
    next,
  )
}
