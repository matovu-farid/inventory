export const RECEIPT_GRID_COLUMNS = [
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

export type ReceiptGridColumnId = (typeof RECEIPT_GRID_COLUMNS)[number]

export interface ReceiptGridCatalogItem {
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

export interface ReceiptGridRow {
  id: string
  itemName: string
  design: string
  itemId: string | null
  catalogItem: ReceiptGridCatalogItem | null
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

export interface ReceiptGridCellLocation {
  row: number
  column: ReceiptGridColumnId
}
