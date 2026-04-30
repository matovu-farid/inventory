import BigNumber from "bignumber.js"
import type { ParsedRouteItem } from "#/lib/excel/parser"
import type { supplyRouteItems } from "#/db/schema"

type NewSupplyRouteItem = typeof supplyRouteItems.$inferInsert

/**
 * Build a `supplyRouteItems` insert row from a parsed Excel item, with
 * totals (foreign / USD / UGX) computed via BigNumber for precision.
 *
 * Throws if `supplierId` or `supplyRouteId` is missing — historical imports
 * MUST have an "Unknown (Imported)" supplier row to point at, never null.
 */
export function prepareImportItem(
  item: ParsedRouteItem,
  supplierId: string,
  supplyRouteId: string,
): NewSupplyRouteItem {
  if (!supplierId || typeof supplierId !== "string" || supplierId.trim() === "") {
    throw new Error(
      "prepareImportItem: supplierId is required (use the 'Unknown (Imported)' supplier for historical rows)",
    )
  }
  if (
    !supplyRouteId ||
    typeof supplyRouteId !== "string" ||
    supplyRouteId.trim() === ""
  ) {
    throw new Error("prepareImportItem: supplyRouteId is required")
  }

  const unitPriceForeign = new BigNumber(item.unitPriceForeign)
  const totalAmountForeign = unitPriceForeign
    .multipliedBy(item.quantity)
    .toFixed(2, BigNumber.ROUND_HALF_UP)

  let totalAmountUsd: string | null = null
  if (item.exchangeRateForeignToUsd) {
    totalAmountUsd = new BigNumber(totalAmountForeign)
      .dividedBy(new BigNumber(item.exchangeRateForeignToUsd))
      .toFixed(2, BigNumber.ROUND_HALF_UP)
  }

  let totalCostUgx = "0"
  if (item.exchangeRateForeignToUsd && item.exchangeRateUsdToUgx) {
    totalCostUgx = unitPriceForeign
      .dividedBy(new BigNumber(item.exchangeRateForeignToUsd))
      .multipliedBy(new BigNumber(item.exchangeRateUsdToUgx))
      .multipliedBy(item.quantity)
      .toFixed(2, BigNumber.ROUND_HALF_UP)
  }

  return {
    supplyRouteId,
    supplierId,
    productName: item.productName,
    articleNumber: item.articleNumber ?? undefined,
    quantity: item.quantity,
    unitPriceForeign: item.unitPriceForeign,
    foreignCurrency: item.foreignCurrency,
    exchangeRateForeignToUsd: item.exchangeRateForeignToUsd,
    exchangeRateUsdToUgx: item.exchangeRateUsdToUgx,
    totalAmountForeign,
    totalAmountUsd,
    totalCostUgx,
  }
}
