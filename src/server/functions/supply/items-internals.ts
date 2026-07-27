import { z } from 'zod'
import BigNumber from 'bignumber.js'

/**
 * A "cell" is one slot in the procurement entry grid. Three shapes are valid:
 *
 *   aggregate     — neither colorId nor size is set; the itemId on the
 *                   variantInput identifies the item (article-numbered SKU).
 *   color-only    — colorId is set, size is omitted.
 *   color + size  — both are set.
 *
 * Aggregate and color-only rows must later be "split" into full
 * (color + size) variants before goods can be received against them.
 *
 * The input field names keep their existing "itemColorId" / "itemId"
 * spellings because the route + form components have not migrated to the
 * "item" vocabulary yet (UI rename is queued behind #7). On the way out,
 * `materializeVariantRows` maps them to the `colorId` / `itemId` columns
 * that supply_route_lines uses after #6 / #8 (the table itself was
 * renamed `supply_route_items` → `supply_route_lines` in Phase 2 / #8).
 */
export const cellSchema = z.object({
  itemColorId: z.uuid().optional(),
  size: z.string().min(1).optional(),
  quantity: z.number().int().positive(),
})

export const variantInput = z.object({
  supplyRouteId: z.uuid(),
  itemId: z.uuid(),
  exchangeRateForeignToUsd: z.string().optional(),
  exchangeRateUsdToUgx: z.string().optional(),
  supplierId: z.uuid().optional(),
  unitPriceForeign: z.string().optional(),
  foreignCurrency: z.string().optional(),
  minimumSellPriceUgx: z.string().optional(),
  cells: z.array(cellSchema).min(1),
})

export type MaterializedRow = {
  supplyRouteId: string
  supplierId: string
  // Column names match supply_route_lines after the #6 / #8 renames
  // (product_id → item_id, product_color_id → color_id; table renamed
  // supply_route_items → supply_route_lines).
  itemId: string
  colorId: string | null
  size: string | null
  quantity: number
  unitPriceForeign: string
  foreignCurrency: string
  exchangeRateForeignToUsd?: string
  exchangeRateUsdToUgx?: string
  totalAmountForeign: string
  totalAmountUsd: string | null
  totalCostUgx: string
  minimumSellPriceUgx: string
}

export function materializeVariantRows(
  input: z.infer<typeof variantInput>,
): MaterializedRow[] {
  const cells = input.cells.filter((c) => c.quantity > 0)
  if (!input.supplierId || !input.unitPriceForeign || !input.foreignCurrency) {
    throw new Error('Supplier and item cost snapshot are required')
  }
  const supplierId = input.supplierId
  const unitPriceForeign = input.unitPriceForeign
  const foreignCurrency = input.foreignCurrency
  const unitPrice = new BigNumber(unitPriceForeign)
  const isUsd = foreignCurrency === 'USD'
  const fxToUsdStr = isUsd
    ? (input.exchangeRateForeignToUsd ?? '1')
    : input.exchangeRateForeignToUsd

  return cells.map((cell) => {
    const totalAmountForeign = unitPrice.times(cell.quantity).toFixed(2)
    let totalAmountUsd: string | null = null
    let totalCostUgx: string
    if (
      foreignCurrency === 'UGX' ||
      !fxToUsdStr ||
      !input.exchangeRateUsdToUgx
    ) {
      totalCostUgx = totalAmountForeign
    } else {
      const fxToUsd = new BigNumber(fxToUsdStr)
      if (fxToUsd.isZero()) throw new Error('Exchange rate cannot be zero')
      const usdToUgx = new BigNumber(input.exchangeRateUsdToUgx)
      totalAmountUsd = new BigNumber(totalAmountForeign)
        .div(fxToUsd)
        .dp(2, BigNumber.ROUND_HALF_UP)
        .toFixed(2)
      totalCostUgx = unitPrice
        .div(fxToUsd)
        .times(usdToUgx)
        .times(cell.quantity)
        .dp(2, BigNumber.ROUND_HALF_UP)
        .toFixed(2)
    }
    return {
      supplyRouteId: input.supplyRouteId,
      supplierId,
      itemId: input.itemId,
      colorId: cell.itemColorId ?? null,
      size: cell.size ?? null,
      quantity: cell.quantity,
      unitPriceForeign,
      foreignCurrency,
      exchangeRateForeignToUsd: input.exchangeRateForeignToUsd,
      exchangeRateUsdToUgx: input.exchangeRateUsdToUgx,
      totalAmountForeign,
      totalAmountUsd,
      totalCostUgx,
      minimumSellPriceUgx: input.minimumSellPriceUgx ?? '0',
    }
  })
}

/**
 * Pure function for the split (Task 2) flow: takes one existing row plus a
 * list of new (color [+ size]) cells with quantities, and returns the rows
 * that should replace it. Per-row cost numbers are recomputed from the
 * original currency settings so the new variants stay consistent with the
 * trip's exchange rates.
 *
 * Throws if the cells don't sum to the original quantity.
 */
export interface SplitSourceRow {
  supplyRouteId: string
  supplierId: string
  itemId: string | null
  quantity: number
  unitPriceForeign: string
  foreignCurrency: string
  exchangeRateForeignToUsd: string | null
  exchangeRateUsdToUgx: string | null
  minimumSellPriceUgx?: string | null
}

export interface SplitCell {
  itemColorId: string
  size?: string
  quantity: number
}

export function materializeSplitRows(
  source: SplitSourceRow,
  itemIdFallback: string,
  cells: SplitCell[],
): MaterializedRow[] {
  const totalNew = cells.reduce((sum, c) => sum + c.quantity, 0)
  if (totalNew !== source.quantity) {
    throw new Error(
      `Split quantities (${totalNew}) must equal original quantity (${source.quantity})`,
    )
  }
  return materializeVariantRows({
    supplyRouteId: source.supplyRouteId,
    supplierId: source.supplierId,
    itemId: source.itemId ?? itemIdFallback,
    unitPriceForeign: source.unitPriceForeign,
    foreignCurrency: source.foreignCurrency,
    exchangeRateForeignToUsd: source.exchangeRateForeignToUsd ?? undefined,
    exchangeRateUsdToUgx: source.exchangeRateUsdToUgx ?? undefined,
    minimumSellPriceUgx: source.minimumSellPriceUgx ?? '0',
    cells: cells.map((c) => ({
      itemColorId: c.itemColorId,
      size: c.size,
      quantity: c.quantity,
    })),
  })
}
