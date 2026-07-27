import BigNumber from 'bignumber.js'
import type { ParsedRouteItem } from '#/lib/excel/parser'
import type { supplyRouteLines } from '#/db/schema'

type NewSupplyRouteItem = typeof supplyRouteLines.$inferInsert

/**
 * Build a `supplyRouteLines` insert row from a parsed Excel item.
 *
 * The historical importer used to crash because it inserted rows with
 * `supplierId: null as unknown as string`. After variant-flexibility
 * Plan 1, `supply_route_lines` accepts aggregate rows (itemId / colorId
 * / size all NULL), so the importer can legitimately produce
 * "unresolved" rows that an operator splits + receives later. Callers
 * must supply a real supplierId and supplyRouteId.
 *
 * The parsed `itemName` and `articleNumber` are carried as extra
 * properties on the returned object so downstream code can render
 * something meaningful for the operator. Drizzle silently ignores
 * those keys at insert time (the columns don't exist on the table).
 */
export function prepareImportItem(
  item: ParsedRouteItem,
  supplierId: string,
  supplyRouteId: string,
): NewSupplyRouteItem {
  if (!supplierId) {
    throw new Error('prepareImportItem: supplierId is required')
  }
  if (!supplyRouteId) {
    throw new Error('prepareImportItem: supplyRouteId is required')
  }

  const quantity = item.quantity
  const unitPrice = new BigNumber(item.unitPriceForeign)
  const totalForeign = unitPrice.times(quantity)

  let totalAmountUsd: string | null = null
  let totalCostUgx = '0'
  if (
    item.exchangeRateForeignToUsd !== null &&
    item.exchangeRateUsdToUgx !== null
  ) {
    const fxFU = new BigNumber(item.exchangeRateForeignToUsd)
    const fxUU = new BigNumber(item.exchangeRateUsdToUgx)
    if (fxFU.gt(0)) {
      totalAmountUsd = totalForeign
        .div(fxFU)
        .dp(2, BigNumber.ROUND_HALF_UP)
        .toFixed(2)
      totalCostUgx = totalForeign
        .div(fxFU)
        .times(fxUU)
        .dp(2, BigNumber.ROUND_HALF_UP)
        .toFixed(2)
    }
  }

  const base: NewSupplyRouteItem = {
    supplyRouteId,
    supplierId,
    itemId: null,
    colorId: null,
    size: null,
    quantity,
    unitPriceForeign: unitPrice.toFixed(2),
    foreignCurrency: item.foreignCurrency,
    exchangeRateForeignToUsd: item.exchangeRateForeignToUsd,
    exchangeRateUsdToUgx: item.exchangeRateUsdToUgx,
    totalAmountForeign: totalForeign.toFixed(2),
    totalAmountUsd,
    totalCostUgx,
    minimumSellPriceUgx: '0',
  }

  return Object.assign(base, {
    itemName: item.itemName,
    articleNumber: item.articleNumber,
  })
}
