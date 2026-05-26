// src/lib/products.ts
const REGION = "eu-west-1"
const BUCKET = "fidexa-inventory-images"

/**
 * Canonical "ARTICLE COLOR/SIZE" label for a stocked SKU. Used in error
 * messages, audit logs, and notifications so the format stays consistent.
 */
export function formatProductLabel(
  articleNumber: string,
  colorName: string,
  size: string,
): string {
  return `${articleNumber} ${colorName}/${size}`
}

export function productImageUrl(s3Key: string): string
export function productImageUrl(s3Key: string | null | undefined): string | null
export function productImageUrl(s3Key: string | null | undefined): string | null {
  if (!s3Key) return null
  return `https://${BUCKET}.s3.${REGION}.amazonaws.com/${s3Key}`
}

/**
 * Stock row consumed by the POS/aggregation UI. Stock tables now reference
 * inventory via `variant_id` (issue #4) — each row carries the joined
 * variant, which in turn exposes the color (with its parent item/product)
 * and the size string the row corresponds to.
 */
interface StockRow {
  quantityOnHand: number
  variant: {
    size: string
    color: {
      id: string
      colorName: string
      colorHex: string
      imageS3Key: string | null
      product: { id: string; articleNumber: string; name: string; sizes: string[] }
    }
  }
}

export interface AggregatedProduct {
  product: { id: string; articleNumber: string; name: string; sizes: string[] }
  colors: Array<{ id: string; colorName: string; colorHex: string; imageS3Key: string | null }>
  total: number
}

export function aggregateStockByArticle(rows: ReadonlyArray<StockRow>): AggregatedProduct[] {
  const byArticle = new Map<string, AggregatedProduct>()
  for (const row of rows) {
    const color = row.variant.color
    const key = color.product.articleNumber
    let entry = byArticle.get(key)
    if (!entry) {
      entry = { product: color.product, colors: [], total: 0 }
      byArticle.set(key, entry)
    }
    if (!entry.colors.some((c) => c.id === color.id)) {
      entry.colors.push({
        id: color.id,
        colorName: color.colorName,
        colorHex: color.colorHex,
        imageS3Key: color.imageS3Key,
      })
    }
    entry.total += row.quantityOnHand
  }
  return [...byArticle.values()].sort((a, b) =>
    a.product.articleNumber.localeCompare(b.product.articleNumber)
  )
}
