import BigNumber from 'bignumber.js'

import type { ReceiptGridRow } from '#/components/supply/receipt-grid/types'

export function normalizeReceiptLookupText(value: string): string {
  return value.trim().toLocaleLowerCase()
}

export interface ReceiptCatalogIndexEntry {
  itemId: string
  design: string
  articleNumbers: string[]
}

export function findReceiptArtNumberConflict(
  rows: readonly ReceiptGridRow[],
  catalogIndex: readonly ReceiptCatalogIndexEntry[],
): string | null {
  const byId = new Map(catalogIndex.map((item) => [item.itemId, item]))
  const byDesign = new Map<string, ReceiptCatalogIndexEntry>()
  for (const item of catalogIndex) {
    const designKey = normalizeReceiptLookupText(item.design)
    if (!byDesign.has(designKey)) byDesign.set(designKey, item)
  }
  const byArticle = new Map<string, ReceiptCatalogIndexEntry[]>()
  for (const item of catalogIndex) {
    for (const articleNumber of item.articleNumbers) {
      const key = normalizeReceiptLookupText(articleNumber)
      const owners = byArticle.get(key) ?? []
      if (!owners.some((owner) => owner.itemId === item.itemId)) owners.push(item)
      byArticle.set(key, owners)
    }
  }
  const receiptArticles = new Map<string, string>()

  for (const [index, row] of rows.entries()) {
    if (isReceiptRowEmptyForValidation(row) || !row.articleNumber.trim()) continue
    const articleKey = normalizeReceiptLookupText(row.articleNumber)
    const catalogItem =
      (row.itemId ? byId.get(row.itemId) : undefined) ??
      byDesign.get(normalizeReceiptLookupText(row.design))
    const resolvedKey = catalogItem?.itemId ?? normalizeReceiptLookupText(row.design)
    const owners = byArticle.get(articleKey) ?? []
    if (owners.length > 1) {
      return `Receipt line ${index + 1}: art number "${row.articleNumber.trim()}" has conflicting catalog ownership`
    }
    const owner = owners.at(0)
    if (owner && owner.itemId !== resolvedKey) {
      return `Receipt line ${index + 1}: art number "${row.articleNumber.trim()}" belongs to design "${owner.design}"`
    }
    const previousDesign = receiptArticles.get(articleKey)
    if (previousDesign && previousDesign !== resolvedKey) {
      return `Receipt line ${index + 1}: art number "${row.articleNumber.trim()}" is used by another design in this receipt`
    }
    receiptArticles.set(articleKey, resolvedKey)
  }

  return null
}

function isReceiptRowEmptyForValidation(row: ReceiptGridRow): boolean {
  return (
    !row.design.trim() &&
    !row.articleNumber.trim() &&
    !row.colorText.trim() &&
    !row.colorHexText.trim() &&
    !row.sizeText.trim() &&
    row.quantity === null &&
    !row.unitPriceForeign.trim()
  )
}

export interface ReceiptTotalLine {
  quantity: number
  unitPriceForeign: string
}

export interface LegacySupplyLineGroupInput {
  id: string
  supplyRouteId: string
  entryId: string
  supplierId: string
}

export interface LegacySupplyLineGroup {
  key: string
  lineIds: string[]
}

export function normalizeReceiptSizes(value: string): string[] {
  const seen = new Set<string>()
  const sizes: string[] = []
  for (const part of value.split(',')) {
    const trimmed = part.trim()
    if (!trimmed) continue
    const key = trimmed.toLocaleLowerCase()
    if (seen.has(key)) continue
    seen.add(key)
    sizes.push(trimmed)
  }
  return sizes
}

export function calculateReceiptTotals(lines: ReceiptTotalLine[]) {
  let totalPieces = 0
  let totalAmount = new BigNumber(0)
  for (const line of lines) {
    if (!Number.isInteger(line.quantity) || line.quantity <= 0) continue
    const price = new BigNumber(line.unitPriceForeign || 0)
    if (!price.isFinite() || price.isNegative()) continue
    totalPieces += line.quantity
    totalAmount = totalAmount.plus(price.times(line.quantity))
  }
  return {
    totalPieces,
    totalAmountForeign: totalAmount.toFixed(2),
  }
}

export function groupLegacyLinesIntoReceipts(
  lines: LegacySupplyLineGroupInput[],
): LegacySupplyLineGroup[] {
  const groups = new Map<string, LegacySupplyLineGroup>()
  for (const line of lines) {
    const key = `${line.supplyRouteId}|${line.entryId}|${line.supplierId}`
    const group = groups.get(key)
    if (group) group.lineIds.push(line.id)
    else groups.set(key, { key, lineIds: [line.id] })
  }
  return [...groups.values()]
}
