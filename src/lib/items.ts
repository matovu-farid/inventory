const REGION = 'eu-west-1'
const BUCKET = 'fidexa-inventory-images'

/**
 * Canonical "ARTICLE COLOR/SIZE" label for a stocked SKU. Used in error
 * messages, audit logs, and notifications so the format stays consistent.
 */
export function formatItemLabel(
  articleNumber: string,
  colorName: string,
  size: string,
): string {
  return `${articleNumber} ${colorName}/${size}`
}

/**
 * Item-level label for unresolved (variant-less) sale/return/transfer
 * lines. Used by Plan 2b call sites where a line may carry no variant.
 */
export function formatItemLabelUnresolved(
  articleNumber: string,
  name: string,
): string {
  return `${articleNumber} ${name}`
}

export function itemImageUrl(s3Key: string): string
export function itemImageUrl(s3Key: string | null | undefined): string | null
export function itemImageUrl(s3Key: string | null | undefined): string | null {
  if (!s3Key) return null
  return `https://${BUCKET}.s3.${REGION}.amazonaws.com/${s3Key}`
}

/**
 * Stock row consumed by the POS/aggregation UI. Stock tables now
 * reference inventory via `variant_id` (issue #4) — each row carries the
 * joined variant, which in turn exposes the color (with its parent item)
 * and the size string the row corresponds to.
 *
 * `items.sizes` is gone since #7; the per-item set of sizes is implicit
 * in the union of variant rows for that item, derived via
 * `deriveSizes(item.variants)` on the UI side.
 */
interface StockRow {
  quantityOnHand: number
  // Plan 2b: variant is optional — unresolved lots have a null variant.
  // Aggregation groups by item; unresolved rows still contribute their
  // quantity to the parent item's total without producing a variant entry.
  item?: { id: string; articleNumber: string; name: string }
  variant: {
    id: string
    size: string
    color: {
      id: string
      colorName: string
      colorHex: string
      imageS3Key: string | null
      item: { id: string; articleNumber: string; name: string }
    }
  } | null
}

export interface AggregatedItem {
  item: { id: string; articleNumber: string; name: string }
  colors: Array<{
    id: string
    colorName: string
    colorHex: string
    imageS3Key: string | null
  }>
  /**
   * Every variant that has at least one stock row in the input set.
   * Used by `ItemCard` (and the POS picker) to derive the size grid
   * shown beneath the color chips.
   */
  variants: Array<{ id: string; colorId: string; size: string }>
  total: number
}

export function aggregateStockByArticle(
  rows: ReadonlyArray<StockRow>,
): AggregatedItem[] {
  const byArticle = new Map<string, AggregatedItem>()
  for (const row of rows) {
    // Identify the parent item — prefer the denormalized `item` field
    // (Plan 2b: present on every shop_stock row), fall back to the
    // variant's joined item for callers that still pass variant-only
    // shapes (e.g. POS variant picker).
    const parentItem = row.item ?? row.variant?.color.item
    if (!parentItem) continue
    const key = parentItem.articleNumber
    let entry = byArticle.get(key)
    if (!entry) {
      entry = {
        item: parentItem,
        colors: [],
        variants: [],
        total: 0,
      }
      byArticle.set(key, entry)
    }
    const variant = row.variant
    if (variant) {
      const color = variant.color
      if (!entry.colors.some((c) => c.id === color.id)) {
        entry.colors.push({
          id: color.id,
          colorName: color.colorName,
          colorHex: color.colorHex,
          imageS3Key: color.imageS3Key,
        })
      }
      if (!entry.variants.some((v) => v.id === variant.id)) {
        entry.variants.push({
          id: variant.id,
          colorId: color.id,
          size: variant.size,
        })
      }
    }
    entry.total += row.quantityOnHand
  }
  return [...byArticle.values()].sort((a, b) =>
    a.item.articleNumber.localeCompare(b.item.articleNumber),
  )
}
