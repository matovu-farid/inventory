export const ITEM_ENTRY_COLUMNS = [
  'itemName',
  'design',
  'articleNumber',
  'colorText',
  'sizeText',
  'quantity',
  'unitPriceForeign',
  'minimumSellPriceUgx',
  'lowStockThreshold',
] as const

export type ItemEntryColumnId = (typeof ITEM_ENTRY_COLUMNS)[number]
export type ItemEntryGridColumnId = ItemEntryColumnId

export type ItemEntryGridMode = 'receipt' | 'opening-balance'

export interface ItemEntryCatalogItem {
  id: string
  name: string
  design: string
  articleNumbers: Array<{ id: string; articleNumber: string }>
  colors: Array<{ id: string; colorName: string; colorHex: string }>
  variants?: Array<{ id: string; colorId: string; size: string }>
  costCurrency?: string | null
  minimumSellPriceUgx: string
  lowStockThreshold: number
}

export interface ItemEntryRow {
  id: string
  itemName: string
  design: string
  itemId: string | null
  catalogItem: ItemEntryCatalogItem | null
  articleNumber: string
  colorText: string
  colorHexText: string
  colorIds: string[]
  sizeText: string
  quantity: number | null
  unitPriceForeign: string
  minimumSellPriceUgx: string
  lowStockThreshold: number
}

export interface ItemEntryCellLocation {
  row: number
  column: ItemEntryColumnId
}

export type ItemEntryGridCellLocation = ItemEntryCellLocation

export interface ItemEntryGridHistoryControls {
  canUndo: boolean
  canRedo: boolean
  onUndo: () => void
  onRedo: () => void
}

export interface ItemEntryGridConfig {
  mode: ItemEntryGridMode
  supplierId?: string
  costLabel: string
  amountLabel: string
  totalLabel: string
  currency: 'foreign' | 'UGX'
}
