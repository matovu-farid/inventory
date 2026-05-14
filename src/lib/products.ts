// src/lib/products.ts
const REGION = "eu-west-1"
const BUCKET = "fidexa-inventory-images"

export function productImageUrl(s3Key: string): string
export function productImageUrl(s3Key: string | null | undefined): string | null
export function productImageUrl(s3Key: string | null | undefined): string | null {
  if (!s3Key) return null
  return `https://${BUCKET}.s3.${REGION}.amazonaws.com/${s3Key}`
}

interface StockRow {
  quantityOnHand: number
  productColor: {
    id: string
    colorName: string
    colorHex: string
    imageS3Key: string | null
    product: { id: string; articleNumber: string; name: string; sizes: string[] }
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
    const key = row.productColor.product.articleNumber
    let entry = byArticle.get(key)
    if (!entry) {
      entry = { product: row.productColor.product, colors: [], total: 0 }
      byArticle.set(key, entry)
    }
    if (!entry.colors.some((c) => c.id === row.productColor.id)) {
      entry.colors.push({
        id: row.productColor.id,
        colorName: row.productColor.colorName,
        colorHex: row.productColor.colorHex,
        imageS3Key: row.productColor.imageS3Key,
      })
    }
    entry.total += row.quantityOnHand
  }
  return [...byArticle.values()].sort((a, b) =>
    a.product.articleNumber.localeCompare(b.product.articleNumber)
  )
}
