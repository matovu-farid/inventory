import { useMemo } from 'react'

import {
  ItemEntryGrid,
  RECEIPT_GRID_CONFIG,
} from '#/components/item-entry-grid/item-entry-grid'
import type {
  ItemEntryCatalogItem,
  ItemEntryRow,
} from '#/components/item-entry-grid/types'
import type { ItemSummary } from '#/components/items/item-picker'
import {
  createEmptyOpeningBalanceRow,
  isOpeningBalanceRowEmpty,
} from './opening-balance-table-state'
import type { OpeningBalanceTableRow } from './opening-balance-table-state'

export interface OpeningBalanceTableProps {
  rows: OpeningBalanceTableRow[]
  onRowsChange: (rows: OpeningBalanceTableRow[]) => void
  disabled?: boolean
  validationError?: string | null
  resetToken?: string | number
}

function toCatalogItem(item: ItemSummary): ItemEntryCatalogItem {
  return {
    id: item.id,
    name: item.name,
    design: item.design,
    articleNumbers: item.articleNumbers,
    colors: item.colors.map(({ id, colorName, colorHex }) => ({
      id,
      colorName,
      colorHex,
    })),
    variants: item.variants,
    costCurrency: item.costCurrency,
    minimumSellPriceUgx: item.minimumSellPriceUgx ?? '0',
    lowStockThreshold: item.lowStockThreshold ?? 0,
  }
}

function fromCatalogItem(item: ItemEntryCatalogItem): ItemSummary {
  return {
    id: item.id,
    name: item.name,
    design: item.design,
    articleNumbers: item.articleNumbers,
    colors: item.colors.map((color) => ({ ...color, imageS3Key: null })),
    variants: item.variants,
    costCurrency: item.costCurrency,
    minimumSellPriceUgx: item.minimumSellPriceUgx,
    lowStockThreshold: item.lowStockThreshold,
  }
}

function toEntryRow(row: OpeningBalanceTableRow): ItemEntryRow {
  const item = row.item ? toCatalogItem(row.item) : null
  const selectedColor = row.colorId
    ? item?.colors.find((color) => color.id === row.colorId)
    : undefined
  return {
    id: row.id,
    itemName: row.itemName ?? item?.name ?? '',
    design: row.design ?? item?.design ?? '',
    itemId: row.itemId,
    catalogItem: item,
    articleNumber:
      row.articleNumber ?? item?.articleNumbers[0]?.articleNumber ?? '',
    colorText: row.colorText ?? selectedColor?.colorName ?? '',
    colorHexText: row.colorHexText ?? selectedColor?.colorHex ?? '',
    colorIds: row.colorId ? [row.colorId] : [],
    sizeText: row.size,
    quantity: row.quantity,
    unitPriceForeign: row.unitCostUgx,
    minimumSellPriceUgx: row.minimumSellPriceUgx,
    lowStockThreshold: row.lowStockThreshold,
  }
}

function fromEntryRow(row: ItemEntryRow): OpeningBalanceTableRow {
  const item = row.catalogItem ? fromCatalogItem(row.catalogItem) : null
  const colorId = row.colorIds[0] ?? ''
  const variantId = item?.variants?.find(
    (variant) =>
      variant.colorId === colorId &&
      variant.size.trim().toLocaleLowerCase() ===
        row.sizeText.trim().toLocaleLowerCase(),
  )?.id
  return {
    ...createEmptyOpeningBalanceRow(row.id),
    itemId: row.itemId,
    item,
    colorId,
    size: row.sizeText,
    variantId: variantId ?? null,
    quantity: row.quantity,
    unitCostUgx: row.unitPriceForeign,
    minimumSellPriceUgx: row.minimumSellPriceUgx,
    lowStockThreshold: row.lowStockThreshold,
    itemName: row.itemName,
    design: row.design,
    articleNumber: row.articleNumber,
    colorText: row.colorText,
    colorHexText: row.colorHexText,
  }
}

export function OpeningBalanceTable({
  rows,
  onRowsChange,
  disabled = false,
  resetToken,
}: OpeningBalanceTableProps) {
  const entryRows = useMemo(() => rows.map(toEntryRow), [rows])
  const config = useMemo(
    () => ({
      ...RECEIPT_GRID_CONFIG,
      mode: 'opening-balance' as const,
      costLabel: 'Unit cost (UGX)',
      amountLabel: 'Amount (UGX)',
      totalLabel: 'Total (UGX)',
      currency: 'UGX' as const,
    }),
    [],
  )

  return (
    <ItemEntryGrid
      key={resetToken}
      rows={entryRows}
      disabled={disabled}
      config={config}
      onRowsChange={(nextRows) => onRowsChange(nextRows.map(fromEntryRow))}
    />
  )
}

export function openingBalanceRowFromItem(
  id: string,
  item: ItemSummary,
): OpeningBalanceTableRow {
  return {
    ...createEmptyOpeningBalanceRow(id),
    itemId: item.id,
    item,
    itemName: item.name,
    design: item.design,
    articleNumber: item.articleNumbers[0]?.articleNumber ?? '',
    minimumSellPriceUgx: item.minimumSellPriceUgx ?? '0',
    lowStockThreshold: item.lowStockThreshold ?? 0,
  }
}

export function isOpeningBalanceEntryRowEmpty(row: OpeningBalanceTableRow) {
  return isOpeningBalanceRowEmpty(row)
}
